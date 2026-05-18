import { Injectable, Logger, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Student, StudentState } from './student.entity';
import { AuditLog } from './audit-log.entity';
import { OnboardingService } from './onboarding.service';
import { CreateAdmissionDto, CreatePaymentDto, BulkRegistrationDto, ResultPublicationDto } from './dtos';

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    @InjectRepository(Student)
    private studentRepo: Repository<Student>,
    @InjectRepository(AuditLog)
    private auditLogRepo: Repository<AuditLog>,
    private onboardingService: OnboardingService
  ) {}

  async handleAdmission(dto: CreateAdmissionDto) {
    this.logger.log(`Handling admission for ${dto.indexNumber} (ID: ${dto.admissionId})`);
    
    // Check if student exists by either identifier
    let student = await this.studentRepo.findOne({ 
      where: [{ indexNumber: dto.indexNumber }, { admissionId: dto.admissionId }] 
    });
    
    try {
      if (!student) {
        student = this.studentRepo.create({
          ...dto,
          state: StudentState.ADMITTED,
          paymentPercentage: 0,
        });
        await this.studentRepo.save(student);
      } else {
        // Update existing student details if they've changed
        Object.assign(student, dto);
        await this.studentRepo.save(student);
      }
    } catch (error) {
      this.logger.error(`Database error during admission for ${dto.indexNumber}: ${error.message}`);
      throw new ConflictException('Could not save student. Possible duplicate identifier.');
    }

    await this.onboardingService.onboardStudent(student);
    return { success: true };
  }

  async handlePayment(dto: CreatePaymentDto) {
    this.logger.log(`Handling payment for ${dto.admissionId}. Percentage: ${dto.paidPercentage}%`);
    const student = await this.studentRepo.findOne({ where: { admissionId: dto.admissionId } });
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

    // RESTRICTION LOGIC (60% Threshold)
    if (student.paymentPercentage < 60) {
        this.logger.warn(`Student ${student.indexNumber} below 60%. Restricting access.`);
        await this.onboardingService.handleSuspension(student);
    } else {
        this.logger.log(`Student ${student.indexNumber} at or above 60%. Ensuring access.`);
        // If they were restricted or just reached threshold, activate them
        await this.onboardingService.onboardStudent(student); 
        await this.onboardingService.handleUnsuspension(student);
    }

    return { 
        success: true, 
        percentage: student.paymentPercentage,
        moodleStatus: student.paymentPercentage < 60 ? 'suspended' : 'active'
    };
  }

  async handleCourseRegistration(dto: BulkRegistrationDto) {
    this.logger.log(`Handling bulk registration for ${dto.admissionId}`);
    const student = await this.studentRepo.findOne({ where: { admissionId: dto.admissionId } });
    if (!student) throw new NotFoundException('Student not found');

    await this.onboardingService.handleBulkCourseEnrollment(student, dto.courses);
    return { success: true, count: dto.courses.length };
  }

  async handleCourseDrop(dto: any) {
    this.logger.log(`Handling course drop for ${dto.admissionId}`);
    const student = await this.studentRepo.findOne({ where: { admissionId: dto.admissionId } });
    if (!student) throw new NotFoundException('Student not found');

    await this.onboardingService.handleCourseUnenrollment(student, dto.courseCode);
    return { success: true };
  }

  async handleResultPublication(dto: ResultPublicationDto) {
    this.logger.log(`Handling result publication for ${dto.admissionId}`);
    const student = await this.studentRepo.findOne({ where: { admissionId: dto.admissionId } });
    if (!student) throw new NotFoundException('Student not found');

    await this.onboardingService.handleResultsSync(student, dto.results);
    return { success: true };
  }

  async handleSemesterEnrolment(dto: any) {
    this.logger.log(`Handling semester enrolment for ${dto.programme}`);
    // Logic for bulk semester enrolment
    return { success: true };
  }

  async handleSemesterDrop(dto: any) {
    this.logger.log(`Handling semester drop for ${dto.admissionId}`);
    const student = await this.studentRepo.findOne({ where: { admissionId: dto.admissionId } });
    if (!student) throw new NotFoundException('Student not found');

    await this.onboardingService.handleSuspension(student);
    return { success: true };
  }

  async handleGraduation(dto: any) {
    this.logger.log(`Handling graduation for ${dto.admissionId}`);
    const student = await this.studentRepo.findOne({ where: { admissionId: dto.admissionId } });
    if (!student) throw new NotFoundException('Student not found');

    student.state = StudentState.GRADUATED;
    await this.studentRepo.save(student);
    return { success: true };
  }
}
