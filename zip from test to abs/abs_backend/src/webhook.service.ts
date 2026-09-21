import { Injectable, Logger, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MoodleQueueService } from './moodle-queue.service';
import { Student, StudentState } from './student.entity';
import { AuditLog } from './audit-log.entity';
import { CreateAdmissionDto, CreatePaymentDto, BulkRegistrationDto, ResultPublicationDto, SemesterEnrolmentDto, SemesterDropDto, GraduationDto } from './dtos';

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

  async handleAdmission(dto: CreateAdmissionDto) {
    const indexNumber = (dto.indexNumber || '').trim();
    const admissionId = (dto.admissionId || '').trim();
    this.logger.log(`Handling admission for ${indexNumber} (ID: ${admissionId})`);
    
    // Check if student exists by either identifier
    let student = await this.studentRepo.findOne({ 
      where: [{ indexNumber: indexNumber }, { admissionId: admissionId }] 
    });
    
    try {
      if (!student) {
        student = this.studentRepo.create({
          ...dto,
          indexNumber,
          admissionId,
          state: StudentState.ADMITTED,
          paymentPercentage: 0,
        });
        await this.studentRepo.save(student);

        await this.auditLogRepo.save({
          studentId: student.id,
          action: 'STUDENT_ADMITTED',
          details: `New student admitted into ${dto.programme || 'the system'}`,
        });
      } else {
        // Update existing student details if they've changed
        Object.assign(student, { ...dto, indexNumber, admissionId });
        await this.studentRepo.save(student);

        await this.auditLogRepo.save({
          studentId: student.id,
          action: 'STUDENT_UPDATED',
          details: `Student details updated via webhook`,
        });
      }
    } catch (error) {
      this.logger.error(`Database error during admission for ${dto.indexNumber}: ${error.message}`);
      throw new ConflictException('Could not save student. Possible duplicate identifier.');
    }

    await this.moodleQueue.addJob('ONBOARD_STUDENT', { studentId: student.id });
    return { success: true, message: 'Request processed successfully' };
  }

  async handlePayment(dto: CreatePaymentDto) {
    const admissionId = (dto.admissionId || '').trim();
    this.logger.log(`Handling payment for ${admissionId}. Percentage: ${dto.paidPercentage}%`);
    const student = await this.studentRepo.findOne({ where: [{ admissionId: admissionId }, { indexNumber: admissionId }] });
    if (!student) throw new NotFoundException('Student not found');

    // Update percentage if provided, otherwise increment (fallback)
    if (dto.paidPercentage !== undefined) {
      student.paymentPercentage = dto.paidPercentage;
    } else {
      const newPercentage = (student.paymentPercentage || 0) + 20;
      student.paymentPercentage = Math.min(newPercentage, 100);
    }
    
    await this.studentRepo.save(student);
    await this.auditLogRepo.save({
      studentId: student.id,
      action: 'PAYMENT_RECEIVED',
      details: `Payment of ${dto.amount} processed. Total paid: ${student.paymentPercentage}%`,
    });

    return { success: true, message: 'Request processed successfully' };
  }

  async handleCourseRegistration(dto: BulkRegistrationDto) {
    const admissionId = (dto.admissionId || '').trim();
    this.logger.log(`Handling bulk registration for ${admissionId}`);
    const student = await this.studentRepo.findOne({ where: [{ admissionId: admissionId }, { indexNumber: admissionId }] });
    if (!student) throw new NotFoundException('Student not found');

    await this.moodleQueue.addJob('BULK_ENROLL', { studentId: student.id, courses: dto.courses });
    return { success: true, message: 'Request processed successfully' };
  }

  async handleCourseDrop(dto: any) {
    const admissionId = (dto.admissionId || '').trim();
    this.logger.log(`Handling course drop for ${admissionId}`);
    const student = await this.studentRepo.findOne({ where: [{ admissionId: admissionId }, { indexNumber: admissionId }] });
    if (!student) throw new NotFoundException('Student not found');

    await this.moodleQueue.addJob('UNENROLL', { studentId: student.id, courseCode: dto.courseCode });
    return { success: true, message: 'Request processed successfully' };
  }

  async handleResultPublication(dto: ResultPublicationDto) {
    const admissionId = (dto.admissionId || '').trim();
    this.logger.log(`Handling result publication for ${admissionId}`);
    const student = await this.studentRepo.findOne({ where: [{ admissionId: admissionId }, { indexNumber: admissionId }] });
    if (!student) throw new NotFoundException('Student not found');

    await this.moodleQueue.addJob('SYNC_RESULTS', { studentId: student.id, results: dto.results });
    return { success: true, message: 'Request processed successfully' };
  }

  async handleSemesterEnrolment(dto: SemesterEnrolmentDto) {
    const admissionId = (dto.admissionId || '').trim();
    this.logger.log(`Handling semester enrolment for admission ID ${admissionId}, semester ${dto.semester}`);
    const student = await this.studentRepo.findOne({ where: [{ admissionId: admissionId }, { indexNumber: admissionId }] });
    if (!student) throw new NotFoundException('Student not found');

    await this.moodleQueue.addJob('BULK_ENROLL', { studentId: student.id, courses: dto.courses, semester: dto.semester });
    return { success: true, message: 'Request processed successfully' };
  }

  async handleSemesterDrop(dto: SemesterDropDto) {
    const admissionId = (dto.admissionId || '').trim();
    this.logger.log(`Handling semester drop for ${admissionId}, semester ${dto.semester}`);
    const student = await this.studentRepo.findOne({ where: [{ admissionId: admissionId }, { indexNumber: admissionId }] });
    if (!student) throw new NotFoundException('Student not found');

    await this.moodleQueue.addJob('SUSPEND', { studentId: student.id });
    return { success: true, message: 'Request processed successfully' };
  }

  async handleGraduation(dto: GraduationDto) {
    const admissionId = (dto.admissionId || '').trim();
    this.logger.log(`Handling graduation for ${admissionId}`);
    const student = await this.studentRepo.findOne({ where: [{ admissionId: admissionId }, { indexNumber: admissionId }] });
    if (!student) throw new NotFoundException('Student not found');

    student.state = StudentState.GRADUATED;
    await this.studentRepo.save(student);

    await this.moodleQueue.addJob('GRADUATE', { studentId: student.id, degreeClass: dto.degreeClass });

    return { success: true, message: 'Request processed successfully' };
  }
}
