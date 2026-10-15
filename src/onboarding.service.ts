import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Student, StudentState } from './student.entity';
import { AuditLog } from './audit-log.entity';
import { MountedCourse } from './mounted-course.entity';
import { MoodleService } from './moodle.service';
import { GoogleWorkspaceService } from './google-workspace.service';
import { SmsService } from './sms.service';

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(
    @InjectRepository(Student)
    private studentRepo: Repository<Student>,
    @InjectRepository(AuditLog)
    private auditLogRepo: Repository<AuditLog>,
    @InjectRepository(MountedCourse)
    private mountedCourseRepo: Repository<MountedCourse>,
    private moodleService: MoodleService,
    private googleWorkspaceService: GoogleWorkspaceService,
    private smsService: SmsService,
  ) {}

  async onboardStudent(student: Student) {
    this.logger.log(`Onboarding student: ${student.fullName}`);

    try {
      // 1. Provision Google Workspace Email
      if (!student.schoolEmail || !student.schoolEmail.includes('@')) {
        student.schoolEmail = await this.googleWorkspaceService.provisionEmail(student.indexNumber, student.fullName);
        await this.studentRepo.save(student);
        await this.logAction(student.id, 'GOOGLE_EMAIL_PROVISIONED', `Email: ${student.schoolEmail}`);
      }

      // 2. Create Moodle Account
      if (!student.moodleUserId || student.moodleUserId === 'null' || student.moodleUserId === 'undefined') {
        const moodleId = await this.moodleService.createUser(student);
        if (moodleId) {
          student.moodleUserId = String(moodleId);
          student.moodleAccountCreated = true;
          await this.studentRepo.save(student);
          await this.logAction(student.id, 'MOODLE_ACCOUNT_CREATED', `Moodle ID: ${moodleId}`);
        } else {
          student.moodleUserId = null as any;
          student.moodleAccountCreated = false;
          await this.studentRepo.save(student);
          this.logger.error(`Could not resolve or create Moodle user for ${student.indexNumber}`);
        }
      }

      // 3. Default to RESTRICTED so they are forced to register courses before LMS access
      if (student.state === StudentState.ADMITTED) {
        student.state = StudentState.RESTRICTED;
        await this.studentRepo.save(student);
        await this.logAction(student.id, 'STUDENT_RESTRICTED', 'Student restricted pending course registration');
        
        // Ensure they are actually suspended in Moodle
        await this.handleSuspension(student);

        // 4. Send Welcome SMS instructing them to register ONLY to freshers (0326)
        if (student.indexNumber && student.indexNumber.includes('0326')) {
          const msg = `Hi ${student.fullName}, welcome to HTU! Your LMS account is created. Login at lms.htu.edu.gh with your index number (Password: Student@123). Please register your courses on the Student Portal to unlock access.`;
          await this.smsService.sendSms(student.phone, msg);
        } else {
          this.logger.log(`Skipping Welcome SMS for continuing/legacy student: ${student.indexNumber}`);
        }
      }

    } catch (error) {
      this.logger.error(`Onboarding failed for ${student.indexNumber}: ${error.message}`);
      await this.logAction(student.id, 'ONBOARDING_FAILED', error.message);
    }
  }

  async handleBulkCourseEnrollment(student: Student, courses: { courseCode: string }[], semester?: string) {
    // 1. Auto-resolve Moodle User ID if missing or corrupted
    if (!student.moodleUserId || student.moodleUserId === 'null' || student.moodleUserId === 'undefined') {
      let existingMoodleId = await this.moodleService.getUserIdByUsername(student.indexNumber);
      if (!existingMoodleId && student.schoolEmail) {
        existingMoodleId = await this.moodleService.getUserIdByEmail(student.schoolEmail);
      }

      if (existingMoodleId) {
        student.moodleUserId = String(existingMoodleId);
        student.moodleAccountCreated = true;
        await this.studentRepo.save(student);
        await this.logAction(student.id, 'MOODLE_ACCOUNT_LINKED', `Linked existing Moodle user ID: ${existingMoodleId}`);
      } else {
        await this.onboardStudent(student);
      }
    }
    
    if (!student.moodleUserId || student.moodleUserId === 'null' || student.moodleUserId === 'undefined') {
      this.logger.error(`Cannot enroll student ${student.indexNumber} - Moodle account not found or creation failed.`);
      await this.logAction(student.id, 'COURSE_ENROLLMENT_FAILED', 'Skipped course enrollment: Moodle account does not exist.');
      return;
    }

    // 2. Unconditionally unsuspend user in Moodle so LMS access is unlocked immediately upon course registration
    try {
      await this.moodleService.unsuspendUser(student.moodleUserId);
      if (student.state !== StudentState.ACTIVE) {
        student.state = StudentState.ACTIVE;
        await this.studentRepo.save(student);
        await this.logAction(student.id, 'ACCOUNT_UNSUSPENDED', 'LMS access restored upon course registration');
      }
    } catch (unErr: any) {
      this.logger.warn(`Could not unsuspend user ${student.indexNumber} in Moodle: ${unErr.message}`);
    }

    const resolvedCourseIds: number[] = [];
    const missingCourses: string[] = [];

    for (const c of courses) {
      const code = (c.courseCode || '').trim();
      if (!code) continue;

      let moodleCourseId: number | null = null;

      // 1. Resolve immediately from local mounted_courses table (sub-millisecond speed)
      try {
        const mounted = await this.mountedCourseRepo.findOne({
          where: [
            { courseCode: code },
            { courseCode: `${code}_26/27` },
            { courseCode: `${code}_25/26` }
          ] as any
        });
        if (mounted && mounted.moodleCourseId) {
          moodleCourseId = mounted.moodleCourseId;
        }
      } catch (dbErr: any) {
        this.logger.warn(`Could not lookup course ${code} locally: ${dbErr.message}`);
      }

      // 2. Fallback to Moodle REST API lookup only if not found locally
      if (!moodleCourseId) {
        moodleCourseId = await this.moodleService.getCourseIdByShortname(`${code}_26/27`);
      }
      if (!moodleCourseId) {
        moodleCourseId = await this.moodleService.getCourseIdByShortname(code);
      }
      
      // AUTO COURSE CREATION: If course does not exist, create it on-the-fly!
      if (!moodleCourseId) {
        this.logger.log(`Course ${code} not found on Moodle. Attempting dynamic creation...`);
        const courseName = (c as any).courseName || code;
        try {
          moodleCourseId = await this.moodleService.createCourse(code, courseName, semester, (c as any).academicYear || '2026/2027');
          if (moodleCourseId) {
            await this.logAction(
              student.id,
              'COURSE_CREATED',
              `Dynamically created course: ${code} (${courseName})`
            );
          }
        } catch (error: any) {
          this.logger.error(`Dynamic course creation failed for ${code}: ${error.message}`);
          await this.logAction(
            student.id,
            'COURSE_CREATION_FAILED',
            `Could not dynamically create course ${code}: ${error.message}`
          );
        }
      }

      if (moodleCourseId) {
        resolvedCourseIds.push(moodleCourseId);
      } else {
        missingCourses.push(code);
      }
    }

    if (resolvedCourseIds.length > 0) {
      try {
        await this.moodleService.enrollStudent(student.moodleUserId, resolvedCourseIds);
        await this.logAction(student.id, 'COURSES_ENROLLED', `Successfully enrolled in: ${courses.filter(c => !missingCourses.includes(c.courseCode)).map(c => c.courseCode).join(', ')}`);
        
        // Clear pending registration state upon successful enrollment
        student.pendingCourses = null;
        student.pendingSemester = null;
        student.pendingAcademicYear = null;
        await this.studentRepo.save(student);
      } catch (error: any) {
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
    let failedCount = 0;
    for (const student of students) {
      try {
        const shouldBeActive = true; 
        
        if (shouldBeActive && student.state !== StudentState.ACTIVE) {
          await this.onboardStudent(student);
          if (student.moodleUserId) {
            await this.handleUnsuspension(student);
          }
          updatedCount++;
        } else if (!shouldBeActive && student.state === StudentState.ACTIVE) {
          await this.handleSuspension(student);
          updatedCount++;
        }
      } catch (err: any) {
        this.logger.error(`Error syncing student ${student.indexNumber}: ${err.message}`);
        failedCount++;
      }
    }
    
    this.logger.log(`Bulk sync completed. Updated ${updatedCount} students, ${failedCount} failed.`);
    return { updatedCount, failedCount, totalStudents: students.length };
  }

  async handleGraduation(student: Student, degreeClass: string) {
    if (student.moodleUserId) {
        try {
            await this.moodleService.convertUserToAlumni(student.moodleUserId);
            await this.logAction(student.id, 'ALUMNI_CONVERSION', `Converted Moodle account to Alumni status`);
        } catch (error) {
            this.logger.error(`Moodle alumni conversion failed: ${error.message}`);
            await this.logAction(student.id, 'ALUMNI_CONVERSION_FAILED', `Error: ${error.message}`);
        }
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
