import { Injectable, Logger, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MoodleQueueService } from './moodle-queue.service';
import { Student, StudentState } from './student.entity';
import { AuditLog } from './audit-log.entity';

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    @InjectRepository(Student)
    private studentRepo: Repository<Student>,
    @InjectRepository(AuditLog)
    private auditLogRepo: Repository<AuditLog>,
    private moodleQueue: MoodleQueueService
  ) {}

  private extractStudentIdentifier(rawBody: any): string {
    return (
      rawBody?.indexNumber ||
      rawBody?.index_number ||
      rawBody?.indexNo ||
      rawBody?.admissionId ||
      rawBody?.admission_id ||
      rawBody?.student_id ||
      rawBody?.id ||
      ''
    ).toString().trim();
  }

  private normalizeCourses(rawCourses: any): { courseCode: string; courseName?: string }[] {
    const courses: { courseCode: string; courseName?: string }[] = [];
    if (!rawCourses) return courses;

    const list = Array.isArray(rawCourses) ? rawCourses : [rawCourses];

    for (const item of list) {
      if (typeof item === 'string' && item.trim()) {
        courses.push({ courseCode: item.trim() });
      } else if (typeof item === 'object' && item !== null) {
        const code = (item.courseCode || item.course_code || item.code || item.course_id || '').toString().trim();
        const name = (item.courseName || item.course_name || item.title || code).toString().trim();
        if (code) {
          courses.push({ courseCode: code, courseName: name });
        }
      }
    }
    return courses;
  }

  async handleAdmission(rawBody: any) {
    const indexNumber = this.extractStudentIdentifier(rawBody);
    const admissionId = (rawBody?.admissionId || rawBody?.admission_id || indexNumber).toString().trim();
    const fullName = (rawBody?.fullName || rawBody?.full_name || rawBody?.name || indexNumber).toString().trim();

    if (!indexNumber) {
      throw new BadRequestException('Student indexNumber or admissionId is required');
    }

    this.logger.log(`Handling admission for ${indexNumber} (ID: ${admissionId})`);
    
    let student = await this.studentRepo.findOne({ 
      where: [{ indexNumber }, { admissionId }] 
    });
    
    try {
      if (!student) {
        student = this.studentRepo.create({
          indexNumber,
          admissionId,
          fullName,
          email: rawBody?.email || null,
          phone: rawBody?.phone || null,
          programme: rawBody?.programme || rawBody?.program || null,
          level: rawBody?.level ? String(rawBody.level) : '100',
          schoolEmail: `${indexNumber.toLowerCase()}@htu.edu.gh`,
          state: StudentState.ACTIVE,
          paymentPercentage: 100,
        });
        await this.studentRepo.save(student);

        await this.auditLogRepo.save({
          studentId: student.id,
          action: 'STUDENT_ADMITTED',
          details: `New student admitted into ${student.programme || 'the system'}`,
        });
      } else {
        Object.assign(student, { 
          fullName: fullName || student.fullName,
          programme: rawBody?.programme || rawBody?.program || student.programme,
          level: rawBody?.level ? String(rawBody.level) : student.level,
        });
        await this.studentRepo.save(student);

        await this.auditLogRepo.save({
          studentId: student.id,
          action: 'STUDENT_UPDATED',
          details: `Student details updated via webhook`,
        });
      }
    } catch (error) {
      this.logger.error(`Database error during admission for ${indexNumber}: ${error.message}`);
      throw new ConflictException('Could not save student record.');
    }

    await this.moodleQueue.addJob('ONBOARD_STUDENT', { studentId: student.id });
    return { success: true, message: 'Admission request processed successfully', indexNumber };
  }

  async handlePayment(rawBody: any) {
    const identifier = this.extractStudentIdentifier(rawBody);
    if (!identifier) throw new BadRequestException('Student identifier is required');

    this.logger.log(`Handling payment for ${identifier}`);
    let student = await this.studentRepo.findOne({ where: [{ admissionId: identifier }, { indexNumber: identifier }] });
    
    if (!student) {
      // Auto-provision if missing
      student = this.studentRepo.create({
        indexNumber: identifier,
        admissionId: identifier,
        fullName: rawBody?.fullName || identifier,
        state: StudentState.ACTIVE,
        paymentPercentage: 100,
      });
      await this.studentRepo.save(student);
    } else {
      student.paymentPercentage = 100;
      student.state = StudentState.ACTIVE;
      await this.studentRepo.save(student);
    }

    await this.auditLogRepo.save({
      studentId: student.id,
      action: 'PAYMENT_RECEIVED',
      details: `Payment processed for student ${identifier}`,
    });

    return { success: true, message: 'Payment processed successfully', studentIdentifier: identifier };
  }

  async handleCourseRegistration(rawBody: any) {
    const identifier = this.extractStudentIdentifier(rawBody);
    if (!identifier) {
      throw new BadRequestException('Student identifier (indexNumber or admissionId) is required');
    }

    this.logger.log(`Handling course registration webhook for student ${identifier}`);
    
    let student = await this.studentRepo.findOne({ 
      where: [{ indexNumber: identifier }, { admissionId: identifier }] 
    });

    if (!student) {
      this.logger.log(`Student ${identifier} not in DB. Auto-provisioning student record...`);
      student = this.studentRepo.create({
        indexNumber: identifier,
        admissionId: rawBody?.admissionId || identifier,
        fullName: rawBody?.fullName || rawBody?.full_name || rawBody?.name || identifier,
        programme: rawBody?.programme || rawBody?.program || null,
        level: rawBody?.level ? String(rawBody.level) : '100',
        schoolEmail: `${identifier.toLowerCase()}@htu.edu.gh`,
        state: StudentState.ACTIVE,
        moodleAccountCreated: false,
      });
      await this.studentRepo.save(student);
    }

    const rawCourses = rawBody?.courses || rawBody?.course_list || rawBody?.registered_courses || rawBody?.course_codes || [];
    const courses = this.normalizeCourses(rawCourses);
    const semester = String(rawBody?.semester || rawBody?.term || '1');
    const academicYear = String(rawBody?.academicYear || rawBody?.academic_year || rawBody?.year || '2026/2027');

    await this.moodleQueue.addJob('BULK_ENROLL', { 
      studentId: student.id, 
      courses,
      semester,
      academicYear
    });

    return { 
      success: true, 
      message: 'Course registration processed and queued successfully',
      studentIdentifier: identifier,
      coursesCount: courses.length,
      courses
    };
  }

  async handleCourseDrop(rawBody: any) {
    const identifier = this.extractStudentIdentifier(rawBody);
    if (!identifier) throw new BadRequestException('Student identifier is required');

    this.logger.log(`Handling course drop for ${identifier}`);
    const student = await this.studentRepo.findOne({ where: [{ admissionId: identifier }, { indexNumber: identifier }] });
    if (!student) throw new NotFoundException('Student not found');

    const courseCode = rawBody?.courseCode || rawBody?.course_code || rawBody?.code;
    await this.moodleQueue.addJob('UNENROLL', { studentId: student.id, courseCode });
    return { success: true, message: 'Course drop processed successfully' };
  }

  async handleResultPublication(rawBody: any) {
    const identifier = this.extractStudentIdentifier(rawBody);
    if (!identifier) throw new BadRequestException('Student identifier is required');

    this.logger.log(`Handling result publication for ${identifier}`);
    const student = await this.studentRepo.findOne({ where: [{ admissionId: identifier }, { indexNumber: identifier }] });
    if (!student) throw new NotFoundException('Student not found');

    const results = rawBody?.results || [];
    await this.moodleQueue.addJob('SYNC_RESULTS', { studentId: student.id, results });
    return { success: true, message: 'Result publication processed successfully' };
  }

  async handleSemesterEnrolment(rawBody: any) {
    return this.handleCourseRegistration(rawBody);
  }

  async handleSemesterDrop(rawBody: any) {
    const identifier = this.extractStudentIdentifier(rawBody);
    if (!identifier) throw new BadRequestException('Student identifier is required');

    const student = await this.studentRepo.findOne({ where: [{ admissionId: identifier }, { indexNumber: identifier }] });
    if (!student) throw new NotFoundException('Student not found');

    await this.moodleQueue.addJob('SUSPEND', { studentId: student.id });
    return { success: true, message: 'Semester drop processed successfully' };
  }

  async handleGraduation(rawBody: any) {
    const identifier = this.extractStudentIdentifier(rawBody);
    if (!identifier) throw new BadRequestException('Student identifier is required');

    const student = await this.studentRepo.findOne({ where: [{ admissionId: identifier }, { indexNumber: identifier }] });
    if (!student) throw new NotFoundException('Student not found');

    student.state = StudentState.GRADUATED;
    await this.studentRepo.save(student);

    await this.moodleQueue.addJob('GRADUATE', { studentId: student.id, degreeClass: rawBody?.degreeClass || 'Graduate' });

    return { success: true, message: 'Graduation processed successfully' };
  }
}

