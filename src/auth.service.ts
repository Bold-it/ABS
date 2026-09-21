import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OAuth2Client } from 'google-auth-library';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private oauth2Client: OAuth2Client;

  constructor(private jwtService: JwtService) {
    this.oauth2Client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
  }

  async login(loginDto: any) {
    const { email, password } = loginDto;

    // FOR THE DEMO: We will allow a specific admin account
    // In a real system, you'd check this against a 'User' table in the DB
    if (email === 'admin@htu.edu.gh' && password === 'HTU@Admin2026') {
      const payload = { sub: 'admin_1', email: email, role: 'admin' };
      return {
        access_token: await this.jwtService.signAsync(payload),
        user: {
          id: 'admin_1',
          email: email,
          name: 'HTU Admin',
        },
      };
    }

    throw new UnauthorizedException('Invalid credentials');
  }

  async googleLogin(credential: string) {
    try {
      const ticket = await this.oauth2Client.verifyIdToken({
        idToken: credential,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      const payload = ticket.getPayload();
      const email = payload?.email;
      const name = payload?.name;

      // Define authorized personnel
      const SUPER_ADMIN = 'moses.nyarko@htu.edu.gh';
      const AUTHORIZED_ADMINS = [
        's.agana@htu.edu.gh',
        'sagana@htu.edu.gh',   // Alias — Google sometimes returns capital-S variant
        'gkumador@htu.edu.gh',
        // Add more admins here later
      ];

      // Normalize email to lowercase to avoid casing mismatches from Google
      const normalizedEmail = (email || '').toLowerCase().trim();

      if (!normalizedEmail || !normalizedEmail.endsWith('@htu.edu.gh')) {
        throw new UnauthorizedException('You must use an @htu.edu.gh email address.');
      }

      let role: string | null = null;
      if (normalizedEmail === SUPER_ADMIN) {
        role = 'super_admin';
      } else if (AUTHORIZED_ADMINS.map(e => e.toLowerCase()).includes(normalizedEmail)) {
        role = 'admin';
      }

      if (!role) {
        this.logger.warn(`Unauthorized access attempt by: ${normalizedEmail}`);
        throw new UnauthorizedException('Your @htu.edu.gh account is not authorized to access this dashboard.');
      }

      const jwtPayload = { sub: normalizedEmail, email: normalizedEmail, role: role };
      return {
        access_token: await this.jwtService.signAsync(jwtPayload),
        user: {
          id: normalizedEmail,
          email: normalizedEmail,
          name: name || 'HTU Administrator',
          role: role
        },
      };
    } catch (error) {
      // Re-throw our own UnauthorizedException messages as-is (don't mask them)
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      this.logger.error(`Google token verification failed: ${error.message}`);
      throw new UnauthorizedException('Google sign-in failed. Please try again.');
    }
  }
}
