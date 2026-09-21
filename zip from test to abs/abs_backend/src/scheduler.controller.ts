import { Controller, Get, Query, UnauthorizedException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Student } from './student.entity';
import { Repository } from 'typeorm';
import { SmsService } from './sms.service';

@Controller('scheduler')
export class SchedulerController {
  private readonly logger = new Logger(SchedulerController.name);

  constructor(
    @InjectRepository(Student)
    private studentRepo: Repository<Student>,
    private smsService: SmsService
  ) {}

  @Get('process-reminders')
  async processReminders(@Query('key') key: string) {
    if (key !== process.env.SOIS_API_KEY) {
      throw new UnauthorizedException();
    }
    
    this.logger.log('Processing fee reminders...');
    const studentsWithBalance = await this.studentRepo.createQueryBuilder('student')
      .where('student.paymentPercentage < :threshold', { threshold: 100 })
      .getMany();

    for (const student of studentsWithBalance) {
      const balance = 100 - (student.paymentPercentage || 0);
      const message = `Hi ${student.fullName}, friendly reminder that you have a ${balance}% fee balance. Please settle to avoid LMS restrictions.`;
      await this.smsService.sendSms(student.phone, message);
    }

    return { success: true, processed: studentsWithBalance.length };
  }
}
