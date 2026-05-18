import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly isMock: boolean;

  constructor(private configService: ConfigService) {
    this.isMock = this.configService.get<string>('SMS_MOCK_MODE') === 'true';
  }

  async sendSms(phone: string, message: string) {
    if (this.isMock) {
      this.logger.log(`[MOCK] SMS to ${phone}: ${message}`);
      return true;
    }
    // Real implementation would call Arkesel or similar
    return true;
  }
}
