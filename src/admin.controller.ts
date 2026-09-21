import { Controller, Get, Post, Delete, Body, Param, Query, Logger, UseGuards } from '@nestjs/common';
import { OnboardingService } from './onboarding.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Student, StudentState } from './student.entity';
import { Repository } from 'typeorm';
import { AuditLog } from './audit-log.entity';
import { MoodleService } from './moodle.service';
import { MoodleQueueService } from './moodle-queue.service';

import { EmailService } from './email.service';
import { SoisService } from './sois.service';

@Controller('admin')
export class AdminController {
  constructor(
    @InjectRepository(Student)
    private studentRepo: Repository<Student>,
    @InjectRepository(AuditLog)
    private auditLogRepo: Repository<AuditLog>,
    private onboardingService: OnboardingService,
    private moodleService: MoodleService,
    private emailService: EmailService,
    private soisService: SoisService,
    private moodleQueue: MoodleQueueService
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

    return {
      postgres: dbStatus,
      redis: 'connected',
      finance: 'connected',
      lms: lmsStatus ? 'connected' : 'failed'
    };
  }

  @Post('academic-year/rollover')
  async triggerAcademicYearRollover() {
    Logger.log('Admin triggered Academic Year Rollover (Bulk Suspension)');
    
    // Find all returning students (ACTIVE)
    const activeStudents = await this.studentRepo.find({
      where: { state: StudentState.ACTIVE }
    });

    if (activeStudents.length === 0) {
      return { success: true, message: 'No active students found to suspend.', queuedCount: 0 };
    }

    let queuedCount = 0;
    for (const student of activeStudents) {
      // Set to RESTRICTED so they require course registration to be unsuspended
      student.state = StudentState.RESTRICTED;
      await this.studentRepo.save(student);

      // Queue the actual Moodle suspension in the background safely
      await this.moodleQueue.addJob('SUSPEND', { studentId: student.id });
      queuedCount++;
    }

    return { 
      success: true, 
      message: `Successfully queued ${queuedCount} students for suspension. The background worker is processing them now.`,
      queuedCount
    };
  }

  @Get('students/sync-all')
  @Post('students/sync-all')
  async syncAll() {
    try {
      const result = await this.onboardingService.syncAllStudentsStatus();
      return { success: true, ...(typeof result === 'object' ? result : { count: result }) };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  @Get('audit-logs')
  async getAuditLogs() {
    try {
      const logs = await this.auditLogRepo.find({ order: { timestamp: 'DESC' }, take: 300 });
      const students = await this.studentRepo.find({
        select: ['id', 'fullName', 'indexNumber', 'admissionId', 'programme']
      });
      
      const studentMap = new Map<string, any>();
      students.forEach(s => {
        if (s.id) studentMap.set(s.id, s);
        if (s.indexNumber) studentMap.set(s.indexNumber, s);
        if (s.admissionId) studentMap.set(s.admissionId, s);
      });

      return logs.map(log => ({
        ...log,
        student: log.studentId ? (studentMap.get(log.studentId) || null) : null,
      }));
    } catch (err) {
      console.error('Error fetching audit logs:', err);
      return [];
    }
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

  @Delete('students/:id')
  async deleteStudent(@Param('id') id: string) {
    const student = await this.studentRepo.findOne({ where: { id } as any });
    if (!student) throw new Error('Student record not found');
    await this.studentRepo.remove(student);
    return { success: true, message: `Student ${student.fullName} deleted successfully` };
  }

  @Post('courses/create')
  async createCourse(@Body() body: { courseCode: string, courseName: string }) {
    const moodleCourseId = await this.moodleService.createCourse(body.courseCode, body.courseName);
    return { success: true, moodleCourseId };
  }

  @Get('courses/sync-sois')
  async syncSoisCoursesGet(
    @Query('year') year?: string,
    @Query('term') term?: string
  ) {
    try {
      return await this.soisService.syncMountedCourses(year, term);
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  @Post('courses/sync-sois')
  async syncSoisCoursesPost(@Body() body?: { year?: string, term?: string }) {
    try {
      return await this.soisService.syncMountedCourses(body?.year, body?.term);
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  @Post('courses/clear')
  async clearCourses(@Body() body: { year?: string, term?: string }) {
    return this.soisService.clearMountedCourses(body?.year, body?.term);
  }

  @Post('courses/realign-lms')
  @Post('moodle/realign-categories')
  async realignMoodleCategories(@Body() body: { year?: string, term?: string, categoryId?: number }) {
    return this.moodleService.realignMoodleCategoriesAndCourses(body?.year, body?.term, body?.categoryId);
  }

  @Post('courses/purge-lms')
  @Post('moodle/purge-lms')
  async purgeMoodleLms() {
    return this.moodleService.purgeMoodleLmsCoursesAndCategories();
  }

  @Get('debug-sois')
  async debugSois(@Query('action') action?: string, @Query('year') year?: string, @Query('term') term?: string) {
    return this.soisService.debugSoisConnection(action, year, term);
  }

  @Get('courses')
  async getMountedCourses(@Query('year') year?: string, @Query('term') term?: string) {
    return this.soisService.getMountedCourses(year, term);
  }

  @Get('students/reconcile-admissions')
  async reconcileAdmissions(
    @Query('year') year?: string,
    @Query('term') term?: string
  ) {
    try {
      return await this.soisService.reconcileAdmissions(year, term);
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  @Get('students/sync-sois-admissions')
  async syncSoisAdmissionsGet(
    @Query('year') year?: string,
    @Query('term') term?: string,
    @Query('action') action?: string
  ) {
    try {
      return await this.soisService.syncAdmittedStudents(year, term, action);
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  @Post('students/sync-sois-admissions')
  async syncSoisAdmissionsPost(
    @Body() body?: { year?: string, term?: string, action?: string }
  ) {
    try {
      return await this.soisService.syncAdmittedStudents(body?.year, body?.term, body?.action);
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  @Get('students/import-missed')
  async importMissedAdmissionsGet() {
    try {
      return await this.soisService.importMissedAdmissions();
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  @Post('students/import-missed')
  async importMissedAdmissionsPost(@Body() body?: { records?: any[] }) {
    try {
      return await this.soisService.importMissedAdmissions(body?.records);
    } catch (err: any) {
      return { success: false, error: err.message };
    }
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
