import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class Ms365Service {
  private readonly logger = new Logger(Ms365Service.name);
  private readonly isMock: boolean;

  constructor(private configService: ConfigService) {
    this.isMock = this.configService.get<string>('M365_MOCK_MODE') === 'true';
  }

  async provisionEmail(indexNumber: string, fullName: string) {
    const email = `${indexNumber.toLowerCase()}@school.edu.gh`;
    if (this.isMock) {
      this.logger.log(`[MOCK] MS365: Provisioning email ${email} for ${fullName}`);
      return email;
    }
    // Real implementation would call Microsoft Graph API
    return email;
  }
}
