import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Student, StudentState } from './student.entity';
import { AuditLog } from './audit-log.entity';
import { MoodleService } from './moodle.service';
import { Ms365Service } from './ms365.service';
import { SmsService } from './sms.service';

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(
    @InjectRepository(Student)
    private studentRepo: Repository<Student>,
    @InjectRepository(AuditLog)
    private auditLogRepo: Repository<AuditLog>,
    private moodleService: MoodleService,
    private ms365Service: Ms365Service,
    private smsService: SmsService,
  ) {}

  async onboardStudent(student: Student) {
    this.logger.log(`Onboarding student: ${student.fullName}`);

    try {
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

    } catch (error) {
      this.logger.error(`Onboarding failed for ${student.indexNumber}: ${error.message}`);
      await this.logAction(student.id, 'ONBOARDING_FAILED', error.message);
    }
  }

  async handleBulkCourseEnrollment(student: Student, courses: { courseCode: string }[]) {
    if (!student.moodleUserId) {
        await this.onboardStudent(student);
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
          moodleCourseId = await this.moodleService.createCourse(c.courseCode, courseName);
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

  async handleCourseUnenrollment(student: Student, courseCode: string) {
    if (student.moodleUserId) {
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
        }
    }
  }

  async handleResultsSync(student: Student, results: { courseCode: string, score: number }[]) {
    if (student.moodleUserId) {
        for (const res of results) {
            await this.moodleService.updateGrade(student.moodleUserId, res.courseCode, res.score);
        }
        await this.logAction(student.id, 'RESULTS_SYNCED', `Synced ${results.length} course results`);
        
        const msg = `Hi ${student.fullName}, your semester results have been published. Log in to Moodle to view your grades!`;
        await this.smsService.sendSms(student.phone, msg);
    }
  }

  async handleSuspension(student: Student) {
    if (student.moodleUserId) {
        await this.moodleService.suspendUser(student.moodleUserId);
        student.state = StudentState.RESTRICTED;
        await this.studentRepo.save(student);
        await this.logAction(student.id, 'ACCOUNT_SUSPENDED', 'LMS access restricted due to fee balance');
    }
  }

  async handleUnsuspension(student: Student) {
    if (student.moodleUserId) {
        await this.moodleService.unsuspendUser(student.moodleUserId);
        student.state = StudentState.ACTIVE;
        await this.studentRepo.save(student);
        await this.logAction(student.id, 'ACCOUNT_UNSUSPENDED', 'LMS access restored');
    }
  }

  async syncAllStudentsStatus() {
    const students = await this.studentRepo.find();
    this.logger.log(`Starting bulk status sync for ${students.length} students`);
    
    let updatedCount = 0;
    for (const student of students) {
      const shouldBeActive = (student.paymentPercentage || 0) >= 60;
      
      if (shouldBeActive && student.state !== StudentState.ACTIVE) {
        await this.onboardStudent(student);
        await this.handleUnsuspension(student);
        updatedCount++;
      } else if (!shouldBeActive && student.state === StudentState.ACTIVE) {
        await this.handleSuspension(student);
        updatedCount++;
      }
    }
    
    this.logger.log(`Bulk sync completed. Updated ${updatedCount} students.`);
    return updatedCount;
  }

  private async logAction(studentId: string, action: string, details: string) {
    await this.auditLogRepo.save({
      studentId,
      action,
      details,
    });
  }
}
