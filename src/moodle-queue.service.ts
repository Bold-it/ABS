import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { OnboardingService } from './onboarding.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Student } from './student.entity';
import { Repository } from 'typeorm';

@Injectable()
export class MoodleQueueService implements OnModuleInit {
  private readonly logger = new Logger(MoodleQueueService.name);
  private queue: { name: string; data: any }[] = [];
  private readonly concurrency = 6;
  private activeWorkers = 0;

  constructor(
    private onboardingService: OnboardingService,
    @InjectRepository(Student)
    private studentRepo: Repository<Student>,
  ) {}

  onModuleInit() {
    // Run immediately on startup to recover any jobs lost during a server restart
    this.runAutoSweep().catch(err => this.logger.error(`Initial sweep failed: ${err.message}`));

    // Auto-sweep every 3 minutes (180,000 ms) during semester registration period
    setInterval(() => {
      this.runAutoSweep().catch(err => this.logger.error(`Auto sweep failed: ${err.message}`));
    }, 180000);
  }

  getQueueStatus() {
    return {
      pendingJobs: this.queue.length,
      activeWorkers: this.activeWorkers,
      concurrency: this.concurrency,
    };
  }

  async addJob(name: string, data: any) {
    this.queue.push({ name, data });
    this.logger.log(`Added job ${name} to memory queue. Queue size: ${this.queue.length}, active workers: ${this.activeWorkers}`);
    this.triggerWorkers();
  }

  private triggerWorkers() {
    while (this.activeWorkers < this.concurrency && this.queue.length > 0) {
      this.activeWorkers++;
      this.spawnWorker().finally(() => {
        this.activeWorkers--;
        if (this.queue.length > 0) {
          this.triggerWorkers();
        }
      });
    }
  }

  private async spawnWorker() {
    while (this.queue.length > 0) {
      const job = this.queue.shift();
      if (!job) break;
      this.logger.log(`Processing job ${job.name} (worker pool active: ${this.activeWorkers})`);
      try {
        await this.executeJob(job.name, job.data);
      } catch (err: any) {
        this.logger.error(`Failed job ${job.name}: ${err.message}`);
      }
    }
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
        return await this.onboardingService.handleGraduation(student as any, data.degreeClass);
      default:
        this.logger.error(`Unknown job type: ${name}`);
    }
  }

  async runAutoSweep() {
    this.logger.log('Running Auto-Recovery Sweep...');

    // 1. Recover any pending course registrations that survived a server restart
    try {
      const pendingEnrollments = await this.studentRepo.createQueryBuilder('s')
        .where('s.pendingCourses IS NOT NULL')
        .take(500)
        .getMany();

      if (pendingEnrollments.length > 0) {
        this.logger.log(`Auto-Sweep: Found ${pendingEnrollments.length} students with pending registrations. Re-queuing...`);
        for (const s of pendingEnrollments) {
          const alreadyQueued = this.queue.some(j => j.name === 'BULK_ENROLL' && j.data?.studentId === s.id);
          if (!alreadyQueued) {
            try {
              const courses = JSON.parse(s.pendingCourses || '[]');
              this.addJob('BULK_ENROLL', {
                studentId: s.id,
                courses,
                semester: s.pendingSemester || '1',
                academicYear: s.pendingAcademicYear || '2026/2027',
              });
            } catch (e: any) {
              this.logger.error(`Could not parse pending courses for ${s.indexNumber}: ${e.message}`);
            }
          }
        }
      }
    } catch (err: any) {
      this.logger.error(`Auto-Sweep error checking pending course registrations: ${err.message}`);
    }

    // 2. Recover any stuck freshers needing Moodle accounts
    try {
      const stuckStudents = await this.studentRepo.createQueryBuilder('s')
        .where('s.moodleAccountCreated = :created', { created: false })
        .andWhere('s.state IN (:...states)', { states: ['ADMITTED', 'ACTIVE'] })
        .take(200)
        .getMany();

      if (stuckStudents.length > 0) {
        this.logger.log(`Auto-Sweep: Found ${stuckStudents.length} stuck students awaiting onboarding.`);
        for (const s of stuckStudents) {
          const alreadyQueued = this.queue.some(j => j.name === 'ONBOARD_STUDENT' && j.data?.studentId === s.id);
          if (!alreadyQueued) {
            this.logger.log(`Auto-Sweep: Requeuing ONBOARD_STUDENT for ${s.indexNumber}`);
            this.addJob('ONBOARD_STUDENT', { studentId: s.id });
          }
        }
      }
    } catch (err: any) {
      this.logger.error(`Auto-Sweep error checking stuck students: ${err.message}`);
    }
  }
}
