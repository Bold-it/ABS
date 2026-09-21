import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { OnboardingService } from './onboarding.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Student } from './student.entity';
import { Repository } from 'typeorm';

@Injectable()
export class MoodleQueueService implements OnModuleInit {
  private readonly logger = new Logger(MoodleQueueService.name);
  private queue: { name: string, data: any }[] = [];
  private isProcessing = false;

  constructor(
    private onboardingService: OnboardingService,
    @InjectRepository(Student)
    private studentRepo: Repository<Student>,
  ) {}

  onModuleInit() {
    // Auto-sweep every 10 minutes (600,000 ms)
    setInterval(() => {
      this.runAutoSweep();
    }, 600000);
  }

  async addJob(name: string, data: any) {
    this.queue.push({ name, data });
    this.logger.log(`Added job ${name} to memory queue. Queue size: ${this.queue.length}`);
    if (!this.isProcessing) {
      // Intentionally not awaiting processQueue so it runs in background
      this.processQueue().catch(err => this.logger.error(`Queue loop failed: ${err.message}`));
    }
  }

  private async processQueue() {
    this.isProcessing = true;
    while (this.queue.length > 0) {
      const job = this.queue.shift();
      if (!job) continue;
      this.logger.log(`Processing job ${job.name}`);
      try {
        await this.executeJob(job.name, job.data);
      } catch (err) {
        this.logger.error(`Failed job ${job.name}: ${err.message}`);
      }
    }
    this.isProcessing = false;
  }

  private async executeJob(name: string, data: any) {
      const student = await this.studentRepo.findOne({ where: { id: data.studentId } });
      if (!student) throw new Error(`Student not found for background job (${data.studentId})`);

      switch (name) {
          case 'ONBOARD_STUDENT': 
              return await this.onboardingService.onboardStudent(student);
          case 'BULK_ENROLL': 
              return await this.onboardingService.handleBulkCourseEnrollment(student, data.courses, data.semester);
          case 'UNENROLL': 
              return await this.onboardingService.handleCourseUnenrollment(student, data.courseCode);
          case 'SYNC_RESULTS': 
              return await this.onboardingService.handleResultsSync(student, data.results);
          case 'SUSPEND': 
              return await this.onboardingService.handleSuspension(student);
          case 'UNSUSPEND': 
              return await this.onboardingService.handleUnsuspension(student);
          case 'GRADUATE': 
              return await this.onboardingService.handleGraduation(student, data.degreeClass);
          default:
              this.logger.error(`Unknown job type: ${name}`);
      }
  }

  private async runAutoSweep() {
      this.logger.log('Running Auto-Recovery Sweep...');
      const stuckStudents = await this.studentRepo.find({ 
          where: { moodleAccountCreated: false } 
      });
      if (stuckStudents.length > 0) {
          this.logger.log(`Auto-Sweep: Found ${stuckStudents.length} stuck students.`);
          for (const s of stuckStudents) {
              this.logger.log(`Auto-Sweep: Requeuing ONBOARD_STUDENT for ${s.indexNumber}`);
              this.addJob('ONBOARD_STUDENT', { studentId: s.id });
          }
      }
  }
}
