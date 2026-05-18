import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { WebhookController } from './webhook.controller';
import { AdminController } from './admin.controller';
import { AppController } from './app.controller';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SchedulerController } from './scheduler.controller';
import { WebhookService } from './webhook.service';
import { OnboardingService } from './onboarding.service';
import { MoodleService } from './moodle.service';
import { Ms365Service } from './ms365.service';
import { SmsService } from './sms.service';
import { Student } from './student.entity';
import { AuditLog } from './audit-log.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'mysql',
        host: configService.get<string>('DB_HOST', 'localhost'),
        port: configService.get<number>('DB_PORT', 3306),
        username: configService.get<string>('DB_USER'),
        password: configService.get<string>('DB_PASSWORD'),
        database: configService.get<string>('DB_NAME'),
        entities: [__dirname + '/*.entity{.ts,.js}'],
        synchronize: true, // Should be false in production, but okay for proto
      }),
      inject: [ConfigService],
    }),
    TypeOrmModule.forFeature([Student, AuditLog]),
    JwtModule.register({
      global: true,
      secret: 'HTU_SUPER_SECRET_KEY_2026', // Use env in prod
      signOptions: { expiresIn: '1d' },
    }),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'dashboard', 'out'),
      exclude: ['/api/(.*)'],
    }),
  ],
  controllers: [AppController, AuthController, WebhookController, AdminController, SchedulerController],
  providers: [
    AuthService,
    WebhookService, 
    OnboardingService, 
    MoodleService, 
    Ms365Service, 
    SmsService
  ],
})
export class AppModule {}
