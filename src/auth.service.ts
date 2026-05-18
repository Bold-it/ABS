import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  constructor(private jwtService: JwtService) {}

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
}
