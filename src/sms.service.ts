import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly isMock: boolean;
  private readonly smsProvider: string;
  private readonly apiKey: string;
  private readonly senderId: string;

  constructor(private configService: ConfigService) {
    // Default to true if not explicitly set to false
    this.isMock = this.configService.get<string>('SMS_MOCK_MODE') !== 'false';
    this.smsProvider = this.configService.get<string>('SMS_PROVIDER') || 'arkesel';
    this.apiKey = this.configService.get<string>('SMS_API_KEY') || '';
    this.senderId = this.configService.get<string>('SMS_SENDER_ID') || 'HTU-LMS';
  }

  sanitizePhone(phone: string): string {
    let clean = phone.replace(/\D/g, '');
    if (clean.startsWith('0')) {
      clean = '233' + clean.substring(1);
    } else if (clean.startsWith('233')) {
      // already ok
    } else if (clean.length === 9) { // Assumes 9 digits missing the leading 0
      clean = '233' + clean;
    }
    return clean;
  }

  async sendSms(phone: string, message: string) {
    if (!phone) return false;
    
    const sanitizedPhone = this.sanitizePhone(phone);

    if (this.isMock || !this.apiKey) {
      this.logger.log(`[MOCK SMS] To: ${sanitizedPhone} | Msg: ${message}`);
      return true;
    }

    try {
      if (this.smsProvider === 'arkesel') {
        await axios.get('https://sms.arkesel.com/sms/api', {
          params: {
            action: 'send-sms',
            api_key: this.apiKey,
            to: sanitizedPhone,
            from: this.senderId,
            sms: message,
          }
        });
      } else if (this.smsProvider === 'hubtel') {
        // Example Hubtel implementation
        await axios.post('https://smsc.hubtel.com/v1/messages/send', {
          From: this.senderId,
          To: sanitizedPhone,
          Content: message,
        }, {
          headers: {
            'Authorization': `Basic ${Buffer.from(this.apiKey).toString('base64')}`
          }
        });
      }
      this.logger.log(`[SMS SENT] To: ${sanitizedPhone} via ${this.smsProvider}`);
      return true;
    } catch (err: any) {
      this.logger.error(`Failed to send SMS to ${sanitizedPhone}: ${err.message}`);
      return false;
    }
  }
}
