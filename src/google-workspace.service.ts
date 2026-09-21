import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';

@Injectable()
export class GoogleWorkspaceService {
  private readonly logger = new Logger(GoogleWorkspaceService.name);
  private readonly isMock: boolean;
  private readonly domain: string;
  private readonly adminEmail: string;
  private auth: any;

  constructor(private configService: ConfigService) {
    this.isMock = this.configService.get<string>('GOOGLE_WORKSPACE_MOCK_MODE') === 'true';
    this.domain = this.configService.get<string>('GOOGLE_WORKSPACE_DOMAIN', 'htu.edu.gh');
    this.adminEmail = this.configService.get<string>('GOOGLE_WORKSPACE_ADMIN_EMAIL');

    if (!this.isMock) {
      try {
        this.initializeGoogleAuth();
      } catch (err: any) {
        this.logger.warn(`Google Workspace auth deferred: ${err.message}. Using mock mode.`);
        (this as any).isMock = true;
      }
    }
  }

  private initializeGoogleAuth() {
    try {
      const jsonPath = this.configService.get<string>('GOOGLE_WORKSPACE_CREDENTIALS_JSON_PATH');
      const jsonString = this.configService.get<string>('GOOGLE_WORKSPACE_CREDENTIALS_JSON');

      const scopes = ['https://www.googleapis.com/auth/admin.directory.user'];

      if (jsonString) {
        const credentials = JSON.parse(jsonString);
        this.auth = new google.auth.JWT({
          email: credentials.client_email,
          key: credentials.private_key,
          scopes,
          subject: this.adminEmail,
        });
      } else if (jsonPath && require('fs').existsSync(jsonPath)) {
        this.auth = new google.auth.JWT({
          keyFile: jsonPath,
          scopes,
          subject: this.adminEmail,
        });
      } else {
        this.logger.warn(`Google Workspace credentials path not found: ${jsonPath}. Using mock fallback.`);
        (this as any).isMock = true;
        return;
      }

      this.logger.log('Google Workspace auth initialized successfully');
    } catch (error: any) {
      this.logger.warn(`Failed to initialize Google Workspace Auth: ${error.message}. Using mock fallback.`);
      (this as any).isMock = true;
    }
  }

  async provisionEmail(indexNumber: string, fullName: string): Promise<string> {
    // Sanitize index number: remove spaces and non-alphanumeric characters for email username
    const cleanIndex = (indexNumber || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    const email = `${cleanIndex}@${this.domain}`;

    if (this.isMock) {
      this.logger.log(`[MOCK] Google Workspace: Provisioning email ${email} for ${fullName}`);
      return email;
    }

    try {
      const directory = google.admin({ version: 'directory_v1', auth: this.auth });

      // Check if user already exists in Google Workspace
      try {
        const existing = await directory.users.get({ userKey: email });
        if (existing && existing.data) {
          this.logger.log(`Google Workspace user ${email} already exists. Linking existing account.`);
          return email;
        }
      } catch (err: any) {
        if (err.status !== 404 && err.response?.status !== 404) {
          this.logger.warn(`Error checking existing Google Workspace user ${email}: ${err.message}`);
        }
      }

      // Split full name into given name and family name
      const nameParts = fullName.trim().split(/\s+/);
      const givenName = nameParts[0] || 'Student';
      const familyName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : 'Student';

      this.logger.log(`Creating new Google Workspace account for ${fullName} (${email})`);

      try {
        await directory.users.insert({
          requestBody: {
            primaryEmail: email,
            name: {
              givenName,
              familyName,
            },
            password: 'Student@123', // Temporary password
            changePasswordAtNextLogin: true,
          },
        });
        this.logger.log(`Successfully provisioned Google Workspace user: ${email}`);
      } catch (insertErr: any) {
        const msg = insertErr.message || '';
        if (msg.includes('already exists') || msg.includes('Duplicate') || insertErr.code === 409 || msg.includes('Invalid parameter value')) {
          this.logger.log(`Google Workspace user ${email} already exists or matched directory user. Linking account.`);
          return email;
        }
        throw insertErr;
      }

      return email;
    } catch (error: any) {
      this.logger.error(`Failed to provision Google Workspace user ${email}: ${error.message}`);
      // Fallback to computed email so onboarding is not permanently blocked
      return email;
    }
  }
}
