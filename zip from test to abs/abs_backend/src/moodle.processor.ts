import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Student, StudentState } from './student.entity';
import { AuditLog } from './audit-log.entity';
import { MoodleService } from './moodle.service';
import { Ms365Service } from './ms365.service';
import { SmsService } from './sms.service';

@Processor('moodle-queue')
export class MoodleProcessor extends WorkerHost {
  private readonly logger = new Logger(MoodleProcessor.name);

  constructor(
    @InjectRepository(Student)
    private studentRepo: Repository<Student>,
    @InjectRepository(AuditLog)
    private auditLogRepo: Repository<AuditLog>,
    private moodleService: MoodleService,
    private ms365Service: Ms365Service,
    private smsService: SmsService,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    this.logger.log(`Processing job ${job.id} of type ${job.name}`);
    try {
      switch (job.name) {
        case 'ONBOARD_STUDENT':
          return await this.handleOnboardStudent(job.data.studentId);
        case 'BULK_ENROLL':
          return await this.handleBulkEnroll(job.data.studentId, job.data.courses, job.data.semester);
        case 'UNENROLL':
          return await this.handleUnenroll(job.data.studentId, job.data.courseCode);
        case 'SYNC_RESULTS':
          return await this.handleSyncResults(job.data.studentId, job.data.results);
        case 'SUSPEND':
          return await this.handleSuspend(job.data.studentId);
        case 'UNSUSPEND':
          return await this.handleUnsuspend(job.data.studentId);
        case 'GRADUATE':
          return await this.handleGraduate(job.data.studentId, job.data.degreeClass);
        default:
          throw new Error(`Unknown job type: ${job.name}`);
      }
    } catch (error) {
      this.logger.error(`Failed job ${job.id} (${job.name}): ${error.message}`);
      throw error; // Let BullMQ handle retries
    }
  }

  private async handleOnboardStudent(studentId: string) {
    const student = await this.studentRepo.findOne({ where: { id: studentId } });
    if (!student) throw new Error('Student not found');

    // 1. Provision MS365 Email
    if (!student.schoolEmail) {
      student.schoolEmail = await this.ms365Service.provisionEmail(student.indexNumber, student.fullName);
      await this.studentRepo.save(student);
      await this.logAction(student.id, 'MS365_EMAIL_PROVISIONED', `Email: ${student.schoolEmail}`);
    }

    // 2. Create Moodle Account
    if (!student.moodleUserId) {
      const moodleId = await this.moodleService.createUser(student);
      student.moodleUserId = String(moodleId);
      student.moodleAccountCreated = true;
      await this.studentRepo.save(student);
      await this.logAction(student.id, 'MOODLE_ACCOUNT_CREATED', `Moodle ID: ${moodleId}`);
    }

    // 3. Update State to ACTIVE
    if (student.state !== StudentState.ACTIVE) {
      student.state = StudentState.ACTIVE;
      await this.studentRepo.save(student);
      await this.logAction(student.id, 'STUDENT_ACTIVATED', 'Student moved to ACTIVE state');

      // 4. Send Welcome SMS
      const msg = `Hi ${student.fullName}, welcome to HTU! Your LMS account is ready. Login at lms.test.htu.edu.gh with your index number.`;
      await this.smsService.sendSms(student.phone, msg);
    }
  }

  private async handleBulkEnroll(studentId: string, courses: { courseCode: string }[], semester?: string) {
    const student = await this.studentRepo.findOne({ where: { id: studentId } });
    if (!student) throw new Error('Student not found');

    if (!student.moodleUserId) {
      await this.handleOnboardStudent(studentId);
      // Refresh student
      Object.assign(student, await this.studentRepo.findOne({ where: { id: studentId } }));
    }
    
    if (!student.moodleUserId) {
      this.logger.error(`Cannot enroll student ${student.indexNumber} - Moodle account creation failed.`);
      await this.logAction(student.id, 'COURSE_ENROLLMENT_FAILED', 'Skipped course enrollment: Moodle account does not exist.');
      return;
    }

    const resolvedCourseIds: number[] = [];
    const missingCourses: string[] = [];

    for (const c of courses) {
      let moodleCourseId = await this.moodleService.getCourseIdByShortname(c.courseCode);
      
      // AUTO COURSE CREATION: If course does not exist, create it on-the-fly!
      if (!moodleCourseId) {
        this.logger.log(`Course ${c.courseCode} not found on Moodle. Attempting dynamic creation...`);
        const courseName = (c as any).courseName || c.courseCode;
        try {
          moodleCourseId = await this.moodleService.createCourse(c.courseCode, courseName, semester);
          if (moodleCourseId) {
            await this.logAction(
              student.id,
              'COURSE_CREATED',
              `Dynamically created course: ${c.courseCode} (${courseName})`
            );
          }
        } catch (error) {
          this.logger.error(`Dynamic course creation failed for ${c.courseCode}: ${error.message}`);
          await this.logAction(
            student.id,
            'COURSE_CREATION_FAILED',
            `Could not dynamically create course ${c.courseCode}: ${error.message}`
          );
        }
      }

      if (moodleCourseId) {
        resolvedCourseIds.push(moodleCourseId);
      } else {
        missingCourses.push(c.courseCode);
      }
    }

    if (resolvedCourseIds.length > 0) {
      try {
        await this.moodleService.enrollStudent(student.moodleUserId, resolvedCourseIds);
        await this.logAction(student.id, 'COURSES_ENROLLED', `Successfully enrolled in: ${courses.filter(c => !missingCourses.includes(c.courseCode)).map(c => c.courseCode).join(', ')}`);
      } catch (error) {
        this.logger.error(`Moodle enrollment call failed: ${error.message}`);
        await this.logAction(student.id, 'COURSE_ENROLLMENT_FAILED', `Moodle API error during enrollment: ${error.message}`);
        throw error;
      }
    }

    if (missingCourses.length > 0) {
      this.logger.warn(`Courses not found on Moodle LMS: ${missingCourses.join(', ')}`);
      await this.logAction(
        student.id,
        'COURSE_ENROLLMENT_WARNING',
        `Enrollment skipped for uncreated/unmounted courses: ${missingCourses.join(', ')}.`
      );
    }
  }

  private async handleUnenroll(studentId: string, courseCode: string) {
    const student = await this.studentRepo.findOne({ where: { id: studentId } });
    if (!student || !student.moodleUserId) return;

    try {
      const moodleCourseId = await this.moodleService.getCourseIdByShortname(courseCode);
      if (moodleCourseId) {
        await this.moodleService.unenrollStudent(student.moodleUserId, [moodleCourseId]);
        await this.logAction(student.id, 'COURSE_UNENROLLED', `Successfully unenrolled from ${courseCode}`);
      } else {
        await this.logAction(student.id, 'COURSE_UNENROLL_WARNING', `Could not unenroll from ${courseCode}: Course not found in Moodle.`);
      }
    } catch (error) {
      this.logger.error(`Moodle unenrollment call failed: ${error.message}`);
      await this.logAction(student.id, 'COURSE_UNENROLL_FAILED', `Moodle API error during unenrollment: ${error.message}`);
      throw error;
    }
  }

  private async handleSyncResults(studentId: string, results: { courseCode: string, score: number }[]) {
    const student = await this.studentRepo.findOne({ where: { id: studentId } });
    if (!student || !student.moodleUserId) return;

    let syncedCount = 0;
    for (const res of results) {
        const moodleCourseId = await this.moodleService.getCourseIdByShortname(res.courseCode);
        if (moodleCourseId) {
            await this.moodleService.updateGrade(student.moodleUserId, String(moodleCourseId), res.score);
            syncedCount++;
        } else {
            this.logger.warn(`Could not sync grade for ${res.courseCode}: Course not found in Moodle.`);
        }
    }
    await this.logAction(student.id, 'RESULTS_SYNCED', `Synced ${syncedCount} out of ${results.length} course results`);
    
    const msg = `Hi ${student.fullName}, your semester results have been published. Log in to Moodle to view your grades!`;
    await this.smsService.sendSms(student.phone, msg);
  }

  private async handleSuspend(studentId: string) {
    const student = await this.studentRepo.findOne({ where: { id: studentId } });
    if (!student || !student.moodleUserId) return;

    await this.moodleService.suspendUser(student.moodleUserId);
    student.state = StudentState.RESTRICTED;
    await this.studentRepo.save(student);
    await this.logAction(student.id, 'ACCOUNT_SUSPENDED', 'LMS access restricted due to fee balance');
  }

  private async handleUnsuspend(studentId: string) {
    const student = await this.studentRepo.findOne({ where: { id: studentId } });
    if (!student || !student.moodleUserId) return;

    await this.moodleService.unsuspendUser(student.moodleUserId);
    student.state = StudentState.ACTIVE;
    await this.studentRepo.save(student);
    await this.logAction(student.id, 'ACCOUNT_UNSUSPENDED', 'LMS access restored');
  }

  private async handleGraduate(studentId: string, degreeClass: string) {
    const student = await this.studentRepo.findOne({ where: { id: studentId } });
    if (!student || !student.moodleUserId) return;

    try {
        await this.moodleService.convertUserToAlumni(student.moodleUserId);
        await this.logAction(student.id, 'ALUMNI_CONVERSION', `Converted Moodle account to Alumni status`);
    } catch (error) {
        this.logger.error(`Moodle alumni conversion failed: ${error.message}`);
        await this.logAction(student.id, 'ALUMNI_CONVERSION_FAILED', `Error: ${error.message}`);
        throw error;
    }
    
    // Send congratulations SMS
    const msg = `Congratulations ${student.fullName}! You have successfully graduated with ${degreeClass}. Your LMS account has been updated to Alumni status.`;
    await this.smsService.sendSms(student.phone, msg);
  }

  private async logAction(studentId: string, action: string, details: string) {
    await this.auditLogRepo.save({
      studentId,
      action,
      details,
    });
  }
}
