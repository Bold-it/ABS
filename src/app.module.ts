import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ScheduleModule } from '@nestjs/schedule';
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
import { GoogleWorkspaceService } from './google-workspace.service';
import { SmsService } from './sms.service';
import { EmailService } from './email.service';
import { CronService } from './cron.service';
import { Student } from './student.entity';
import { AuditLog } from './audit-log.entity';
import { MountedCourse } from './mounted-course.entity';
import { MoodleQueueService } from './moodle-queue.service';
import { SoisService } from './sois.service';

import * as fs from 'fs';

function getStaticRootPath(): string {
  const candidates = [
    join(__dirname, '..', 'out'),
    join(__dirname, '..', 'dashboard', 'out'),
    join(process.cwd(), 'out'),
    join(process.cwd(), 'dashboard', 'out'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return join(__dirname, '..', 'out');
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        let dbPass = configService.get<string>('DB_PASSWORD') || '';
        if (!dbPass || dbPass.includes('the_password_you_set')) {
          dbPass = 'Opensaysme@2929';
        }
        return {
          type: 'mysql',
          host: configService.get<string>('DB_HOST', 'localhost'),
          port: configService.get<number>('DB_PORT', 3306),
          username: configService.get<string>('DB_USER', 'abshtuedu_abs_user'),
          password: dbPass,
          database: configService.get<string>('DB_NAME', 'abshtuedu_abs_db'),
          entities: [Student, AuditLog, MountedCourse],
          synchronize: true,
        };
      },
      inject: [ConfigService],
    }),
    TypeOrmModule.forFeature([Student, AuditLog, MountedCourse]),
    ServeStaticModule.forRoot({
      rootPath: getStaticRootPath(),
      serveRoot: '/',
    }),
    JwtModule.register({
      global: true,
      secret: 'HTU_SUPER_SECRET_KEY_2026', // Use env in prod
      signOptions: { expiresIn: '1d' },
    }),
  ],
  controllers: [AppController, AuthController, WebhookController, AdminController, SchedulerController],
  providers: [
    AuthService,
    WebhookService, 
    OnboardingService, 
    MoodleService, 
    GoogleWorkspaceService, 
    SmsService,
    EmailService,
    CronService,
    MoodleQueueService,
    SoisService
  ],
})
export class AppModule {}
