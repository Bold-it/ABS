import { Controller, Get, Post, Delete, Body, Param, Query, Logger, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
    private moodleQueue: MoodleQueueService,
    private configService: ConfigService
  ) {}

  @Get('stats')
  async getStats() {
    const total = await this.studentRepo.count();
    const admitted = await this.studentRepo.count({ where: { state: StudentState.ADMITTED } });
    const active = await this.studentRepo.count({ where: { state: StudentState.ACTIVE } });
    const restricted = await this.studentRepo.count({ where: { state: StudentState.RESTRICTED } });
    const provisioned = await this.studentRepo.count({ where: { moodleAccountCreated: true } });
    const provisionedFreshers = await this.studentRepo.count({ where: { moodleAccountCreated: true, level: '100' } });
    
    return {
      total,
      admitted,
      active,
      restricted,
      provisioned,
      provisionedFreshers
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
    const smsMock = this.configService.get('SMS_MOCK_MODE') !== 'false' ? 'mock_mode' : 'connected';
    const financeMock = this.configService.get('FINANCE_MOCK_MODE') === 'true' ? 'mock_mode' : 'connected';
    const googleMock = this.configService.get('GOOGLE_WORKSPACE_MOCK_MODE') === 'true' ? 'mock_mode' : 'connected';

    return {
      mysql: dbStatus,
      redis: 'connected',
      finance: financeMock,
      sms: smsMock,
      google: googleMock,
      lms: lmsStatus === 'mock_mode' ? 'mock_mode' : (lmsStatus ? 'connected' : 'failed')
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

  @Get('jobs/failed')
  async getFailedJobs() {
    try {
      // Find logs with FAILED actions
      const logs = await this.auditLogRepo.createQueryBuilder('log')
        .where('log.action LIKE :failed', { failed: '%_FAILED%' })
        .orderBy('log.timestamp', 'DESC')
        .take(100)
        .getMany();

      // Find students whose moodleAccountCreated is false but state is ADMITTED/ACTIVE
      const pendingStudents = await this.studentRepo.createQueryBuilder('student')
        .where('student.moodleAccountCreated = false')
        .andWhere('student.state IN (:...states)', { states: [StudentState.ADMITTED, StudentState.ACTIVE] })
        .getMany();

      const studentMap = new Map<string, any>();
      const allStudentIds = [...logs.map(l => l.studentId).filter(id => id), ...pendingStudents.map(s => s.id)];
      
      if (allStudentIds.length > 0) {
        const students = await this.studentRepo.createQueryBuilder('s')
          .where('s.id IN (:...ids)', { ids: allStudentIds })
          .select(['s.id', 's.fullName', 's.indexNumber', 's.admissionId', 's.programme'])
          .getMany();
        students.forEach(s => studentMap.set(s.id, s));
      }

      const formattedLogs = logs.map(log => ({
        id: log.id,
        type: 'LOG',
        action: log.action,
        details: log.details,
        timestamp: log.timestamp,
        student: log.studentId ? (studentMap.get(log.studentId) || null) : null,
      }));

      const formattedPending = pendingStudents.map(student => ({
        id: `pending-${student.id}`,
        type: 'PENDING_ONBOARDING',
        action: 'ONBOARDING_PENDING',
        details: 'Moodle account creation is pending for this student.',
        timestamp: student.createdAt,
        student: studentMap.get(student.id) || student,
      }));

      return [...formattedLogs, ...formattedPending].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    } catch (err) {
      console.error('Error fetching failed jobs:', err);
      return [];
    }
  }

  @Post('jobs/:id/retry')
  async retryJob(@Param('id') id: string) {
    let studentId = '';
    
    if (id.startsWith('pending-')) {
      studentId = id.replace('pending-', '');
    } else {
      const log = await this.auditLogRepo.findOne({ where: { id: parseInt(id) } as any });
      if (!log || !log.studentId) throw new Error('Job not found or has no associated student');
      studentId = log.studentId;
    }

    const student = await this.studentRepo.findOne({ where: { id: studentId } as any });
    if (!student) throw new Error('Student not found');

    await this.onboardingService.onboardStudent(student);

    const newLog = new AuditLog();
    newLog.studentId = student.id;
    newLog.action = 'MANUAL_RETRY_TRIGGERED';
    newLog.details = `Admin manually retried failed job/pending onboarding for student.`;
    newLog.timestamp = new Date();
    await this.auditLogRepo.save(newLog);

    return { success: true, message: 'Retry triggered successfully' };
  }

  @Get('students')
  async getAllStudents(
    @Query('search') search?: string, 
    @Query('status') status?: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '50'
  ) {
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 50;
    const skip = (pageNum - 1) * limitNum;

    const query = this.studentRepo.createQueryBuilder('student');
    if (search) {
      query.andWhere('(student.fullName LIKE :search OR student.indexNumber LIKE :search)', { search: `%${search}%` });
    }
    if (status) {
      query.andWhere('student.state = :status', { status });
    }

    const total = await query.getCount();
    query.skip(skip).take(limitNum);
    const items = await query.getMany();

    return { 
      items, 
      total, 
      page: pageNum, 
      limit: limitNum, 
      totalPages: Math.ceil(total / limitNum) 
    };
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

  @Get('reports/lms-usage')
  async getLmsUsageReport(@Query('year') year?: string, @Query('term') term?: string) {
    return this.moodleService.getComprehensiveUsageReport(year, term);
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
