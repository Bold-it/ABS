import { Test, TestingModule } from '@nestjs/testing';
import { WebhookService } from './webhook.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bullmq';
import { Student, StudentState } from './student.entity';
import { AuditLog } from './audit-log.entity';

describe('WebhookService', () => {
  let service: WebhookService;
  let studentRepoMock: any;
  let auditLogRepoMock: any;
  let queueMock: any;

  beforeEach(async () => {
    studentRepoMock = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };

    auditLogRepoMock = {
      save: jest.fn(),
    };

    queueMock = {
      add: jest.fn().mockResolvedValue({ id: 'mock-job-id' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookService,
        {
          provide: getRepositoryToken(Student),
          useValue: studentRepoMock,
        },
        {
          provide: getRepositoryToken(AuditLog),
          useValue: auditLogRepoMock,
        },
        {
          provide: getQueueToken('moodle-queue'),
          useValue: queueMock,
        },
      ],
    }).compile();

    service = module.get<WebhookService>(WebhookService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('handleAdmission', () => {
    it('should create a new student and enqueue ONBOARD_STUDENT job', async () => {
      const dto = {
        admissionId: '20261001',
        indexNumber: '0123456789',
        fullName: 'Kofi Mensah',
        email: 'k.mensah@personal-email.com',
        phone: '+233244000000',
        programme: 'BSc Computer Science',
        level: '100',
        feesTotal: 8000,
      };

      studentRepoMock.findOne.mockResolvedValue(null);
      const mockStudent = { id: 'student-uuid', ...dto, state: StudentState.ADMITTED, paymentPercentage: 0 };
      studentRepoMock.create.mockReturnValue(mockStudent);
      studentRepoMock.save.mockResolvedValue(mockStudent);

      const result = await service.handleAdmission(dto);

      expect(result).toEqual({ success: true, message: 'Request processed successfully' });
      expect(studentRepoMock.create).toHaveBeenCalledWith(expect.objectContaining({
        indexNumber: dto.indexNumber,
        state: StudentState.ADMITTED,
      }));
      expect(studentRepoMock.save).toHaveBeenCalledWith(mockStudent);
      expect(queueMock.add).toHaveBeenCalledWith('ONBOARD_STUDENT', { studentId: 'student-uuid' });
    });
  });

  describe('handlePayment', () => {
    it('should enqueue SUSPEND job if payment percentage is < 60%', async () => {
      const dto = {
        amount: 2000,
        admissionId: '20261001',
        reference: 'TXN-01',
        paidAt: '2026-04-20T23:27:00Z',
        paidPercentage: 40,
      };

      const mockStudent = { id: 'student-uuid', indexNumber: '0123456789', paymentPercentage: 0, state: StudentState.ADMITTED };
      studentRepoMock.findOne.mockResolvedValue(mockStudent);
      studentRepoMock.save.mockResolvedValue({ ...mockStudent, paymentPercentage: 40 });

      const result = await service.handlePayment(dto);

      expect(result).toEqual({ success: true, message: 'Request processed successfully' });
      expect(queueMock.add).toHaveBeenCalledWith('SUSPEND', { studentId: 'student-uuid' });
    });

    it('should enqueue ONBOARD_STUDENT and UNSUSPEND jobs if payment percentage is >= 60%', async () => {
      const dto = {
        amount: 5000,
        admissionId: '20261001',
        reference: 'TXN-02',
        paidAt: '2026-04-20T23:27:00Z',
        paidPercentage: 70,
      };

      const mockStudent = { id: 'student-uuid', indexNumber: '0123456789', paymentPercentage: 0, state: StudentState.ADMITTED };
      studentRepoMock.findOne.mockResolvedValue(mockStudent);
      studentRepoMock.save.mockResolvedValue({ ...mockStudent, paymentPercentage: 70 });

      const result = await service.handlePayment(dto);

      expect(result).toEqual({ success: true, message: 'Request processed successfully' });
      expect(queueMock.add).toHaveBeenCalledWith('ONBOARD_STUDENT', { studentId: 'student-uuid' });
      expect(queueMock.add).toHaveBeenCalledWith('UNSUSPEND', { studentId: 'student-uuid' });
    });
  });

  describe('handleCourseRegistration', () => {
    it('should enqueue BULK_ENROLL job', async () => {
      const dto = {
        admissionId: '20261001',
        courses: [{ courseCode: 'MATH161', courseName: 'Calculus I' }],
      };

      const mockStudent = { id: 'student-uuid', indexNumber: '0123456789' };
      studentRepoMock.findOne.mockResolvedValue(mockStudent);

      const result = await service.handleCourseRegistration(dto);

      expect(result).toEqual({ success: true, message: 'Request processed successfully' });
      expect(queueMock.add).toHaveBeenCalledWith('BULK_ENROLL', { studentId: 'student-uuid', courses: dto.courses });
    });
  });

  describe('handleCourseDrop', () => {
    it('should enqueue UNENROLL job', async () => {
      const dto = {
        admissionId: '20261001',
        courseCode: 'MATH161',
      };

      const mockStudent = { id: 'student-uuid', indexNumber: '0123456789' };
      studentRepoMock.findOne.mockResolvedValue(mockStudent);

      const result = await service.handleCourseDrop(dto);

      expect(result).toEqual({ success: true, message: 'Request processed successfully' });
      expect(queueMock.add).toHaveBeenCalledWith('UNENROLL', { studentId: 'student-uuid', courseCode: 'MATH161' });
    });
  });

  describe('handleResultPublication', () => {
    it('should enqueue SYNC_RESULTS job', async () => {
      const dto = {
        admissionId: '20261001',
        results: [{ courseCode: 'MATH161', grade: 'A', score: 85 }],
      };

      const mockStudent = { id: 'student-uuid', indexNumber: '0123456789' };
      studentRepoMock.findOne.mockResolvedValue(mockStudent);

      const result = await service.handleResultPublication(dto);

      expect(result).toEqual({ success: true, message: 'Request processed successfully' });
      expect(queueMock.add).toHaveBeenCalledWith('SYNC_RESULTS', { studentId: 'student-uuid', results: dto.results });
    });
  });

  describe('handleSemesterEnrolment', () => {
    it('should enqueue BULK_ENROLL job', async () => {
      const dto = {
        admissionId: '20261001',
        semester: '1',
        courses: [{ courseCode: 'MATH161', courseName: 'Calculus I' }],
      };

      const mockStudent = { id: 'student-uuid', indexNumber: '0123456789' };
      studentRepoMock.findOne.mockResolvedValue(mockStudent);

      const result = await service.handleSemesterEnrolment(dto);

      expect(result).toEqual({ success: true, message: 'Request processed successfully' });
      expect(queueMock.add).toHaveBeenCalledWith('BULK_ENROLL', { studentId: 'student-uuid', courses: dto.courses, semester: dto.semester });
    });
  });

  describe('handleSemesterDrop', () => {
    it('should enqueue SUSPEND job', async () => {
      const dto = {
        admissionId: '20261001',
        semester: '1',
      };

      const mockStudent = { id: 'student-uuid', indexNumber: '0123456789' };
      studentRepoMock.findOne.mockResolvedValue(mockStudent);

      const result = await service.handleSemesterDrop(dto);

      expect(result).toEqual({ success: true, message: 'Request processed successfully' });
      expect(queueMock.add).toHaveBeenCalledWith('SUSPEND', { studentId: 'student-uuid' });
    });
  });

  describe('handleGraduation', () => {
    it('should update state to GRADUATED and enqueue GRADUATE job', async () => {
      const dto = {
        admissionId: '20261001',
        degreeClass: 'First Class',
        graduationDate: '2026-05-21',
      };

      const mockStudent = { id: 'student-uuid', indexNumber: '0123456789', state: StudentState.ACTIVE };
      studentRepoMock.findOne.mockResolvedValue(mockStudent);
      studentRepoMock.save.mockResolvedValue({ ...mockStudent, state: StudentState.GRADUATED });

      const result = await service.handleGraduation(dto);

      expect(result).toEqual({ success: true, message: 'Request processed successfully' });
      expect(studentRepoMock.save).toHaveBeenCalledWith(expect.objectContaining({ state: StudentState.GRADUATED }));
      expect(queueMock.add).toHaveBeenCalledWith('GRADUATE', { studentId: 'student-uuid', degreeClass: 'First Class' });
    });
  });
});
