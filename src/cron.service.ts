import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { EmailService } from './email.service';
import { SoisService } from './sois.service';
@Injectable()
export class CronService {
  private readonly logger = new Logger(CronService.name);

  constructor(
    private emailService: EmailService,
    private soisService: SoisService
  ) {}

  // Run at 08:00 AM on the 1st day of Aug, Sep, Jan, Feb
  @Cron('0 8 1 1,2,8,9 *')
  async handlePreSemesterReminders() {
    this.logger.log('Triggering pre-semester email reminders...');
    
    const adminEmails = process.env.SUPER_ADMIN_EMAILS || 'moses.nyarko@htu.edu.gh';
    
    const subject = '⚠️ ACTION REQUIRED: Prepare Moodle For New Semester';
    const html = `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
        <h2 style="color: #d97706;">Pre-Semester Action Required</h2>
        <p>Dear Administrator,</p>
        <p>A new academic semester is approaching. To ensure the <strong>Auto Bridge Service (ABS)</strong> can seamlessly route courses, please log in to Moodle and perform your annual setup:</p>
        <ol>
          <li>Create the overarching <strong>Academic Year</strong> folder (e.g., 2026/2027 ACADEMIC YEAR).</li>
          <li>Create the <strong>Semester</strong> and <strong>Faculty</strong> folders inside it.</li>
          <li>Create the <strong>Department</strong> folders, and ensure you set their <strong>ID Number</strong> to match the ABS format (e.g., <code>FAST_DOCS_26_S1</code>).</li>
        </ol>
        <p>If these folders are not created, any new courses dynamically created by ABS will be placed in the Default Miscellaneous category.</p>
        <br/>
        <p>Thank you,<br/><strong>ABS System Engine</strong></p>
      </div>
    `;

    await this.emailService.sendMail(adminEmails, subject, html);
  }

  // Run at 01:00 AM every day
  @Cron('0 1 * * *')
  async handleNightlySync() {
    this.logger.log('Triggering automated nightly SOIS sync...');
    const currentYear = new Date().getFullYear();
    const month = new Date().getMonth(); // 0=Jan
    const academicYear = month >= 7
      ? `${currentYear}/${currentYear + 1}`
      : `${currentYear - 1}/${currentYear}`;
    const term = month >= 7 || month < 1 ? '1' : '2';

    this.logger.log(`Calculated Year: ${academicYear}, Term: ${term}`);
    
    // 1. Sync Courses
    await this.soisService.syncMountedCourses(academicYear, term);
    
    // 2. Sync Students & Enrollments
    await this.soisService.syncAdmittedStudents(academicYear, term, 'enrollments');
    
    this.logger.log('Nightly SOIS sync completed!');
  }
}
