import { Controller, Get, Post, Body, Param, Query, Logger, UseGuards } from '@nestjs/common';
import { OnboardingService } from './onboarding.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Student, StudentState } from './student.entity';
import { Repository } from 'typeorm';
import { AuditLog } from './audit-log.entity';
import { MoodleService } from './moodle.service';

import { EmailService } from './email.service';

@Controller('admin')
export class AdminController {
  constructor(
    @InjectRepository(Student)
    private studentRepo: Repository<Student>,
    @InjectRepository(AuditLog)
    private auditLogRepo: Repository<AuditLog>,
    private onboardingService: OnboardingService,
    private moodleService: MoodleService,
    private emailService: EmailService
  ) {}

  @Get('stats')
  async getStats() {
    const total = await this.studentRepo.count();
    const admitted = await this.studentRepo.count({ where: { state: StudentState.ADMITTED } });
    const active = await this.studentRepo.count({ where: { state: StudentState.ACTIVE } });
    const restricted = await this.studentRepo.count({ where: { state: StudentState.RESTRICTED } });
    
    return {
      total,
      admitted,
      active,
      restricted
    };
  }

  @Get('system/health')
  async getSystemHealth() {
    let dbStatus = 'connected';
    try {
      await this.studentRepo.query('SELECT 1');
    } catch (e) {
      dbStatus = 'failed';
    }

    const lmsStatus = await this.moodleService.checkConnection();

    // Mock Redis check - in real scenario we'd ping redis
    const redisStatus = 'connected'; 

    // Mock Finance link check
    const financeStatus = 'connected';

    return {
      postgres: dbStatus,
      redis: redisStatus,
      finance: financeStatus,
      lms: lmsStatus,
    };
  }

  @Post('students/sync-all')
  async syncAll() {
    const count = await this.onboardingService.syncAllStudentsStatus();
    return { success: true, count };
  }

  @Get('audit-logs')
  async getAuditLogs() {
    const logs = await this.auditLogRepo.find({ order: { timestamp: 'DESC' } });
    
    const students = await this.studentRepo.find();
    const studentMap = new Map(students.map(s => [s.id, s]));

    return logs.map(log => ({
      ...log,
      student: studentMap.get(log.studentId) || null,
    }));
  }

  @Get('students')
  async getAllStudents(@Query('search') search?: string, @Query('status') status?: string) {
    const query = this.studentRepo.createQueryBuilder('student');
    if (search) {
      query.andWhere('(student.fullName LIKE :search OR student.indexNumber LIKE :search)', { search: `%${search}%` });
    }
    if (status) {
      query.andWhere('student.state = :status', { status });
    }
    const items = await query.getMany();
    return { items };
  }

  @Get('students/:id')
  async getStudent(@Param('id') id: string) {
    const student = await this.studentRepo.findOne({ where: { id } as any });
    if (!student) throw new Error('Student not found');
    const logs = await this.auditLogRepo.find({ where: { studentId: id } as any, order: { timestamp: 'DESC' } });
    return {
      ...student,
      auditLogs: logs,
      payments: []
    };
  }

  @Post('activate/:id')
  async forceActivate(@Param('id') id: string) {
    const student = await this.studentRepo.findOne({ where: { id } as any });
    if (!student) throw new Error('Student not found');
    await this.onboardingService.onboardStudent(student);
    return { success: true, message: 'Sync triggered' };
  }

  @Post('courses/create')
  async createCourse(@Body() body: { courseCode: string, courseName: string }) {
    const moodleCourseId = await this.moodleService.createCourse(body.courseCode, body.courseName);
    return { success: true, moodleCourseId };
  }

  @Post('students/enroll-manual')
  async enrollManual(@Body() body: { studentId: string, courseCode: string }) {
    const student = await this.studentRepo.findOne({ where: { id: body.studentId } as any });
    if (!student) throw new Error('Student not found');
    
    const moodleCourseId = await this.moodleService.getCourseIdByShortname(body.courseCode);
    if (!moodleCourseId) throw new Error('Course not found on Moodle');

    await this.moodleService.enrollStudent(student.moodleUserId, [moodleCourseId]);
    
    const log = new AuditLog();
    log.studentId = student.id;
    log.action = 'MANUAL_COURSE_ENROLLED';
    log.details = `Manually enrolled in: ${body.courseCode}`;
    log.timestamp = new Date();
    await this.auditLogRepo.save(log);

    return { success: true };
  }

  @Post('students/reset-password/:id')
  async resetPassword(@Param('id') id: string) {
    const student = await this.studentRepo.findOne({ where: { id } as any });
    if (!student) throw new Error('Student not found');
    if (!student.moodleAccountCreated) throw new Error('Moodle account not created yet');

    await this.moodleService.resetUserPassword(student.moodleUserId);

    const log = new AuditLog();
    log.studentId = student.id;
    log.action = 'MANUAL_PASSWORD_RESET';
    log.details = `Manually reset Moodle password to default (Student@123)`;
    log.timestamp = new Date();
    await this.auditLogRepo.save(log);

    return { success: true };
  }

  @Get('health')
  async health() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
