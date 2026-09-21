import { Controller, Post, Body, Headers, UnauthorizedException, HttpCode, Logger } from '@nestjs/common';
import { WebhookService } from './webhook.service';
import { CreateAdmissionDto, CreatePaymentDto, BulkRegistrationDto, ResultPublicationDto, SemesterEnrolmentDto, SemesterDropDto, GraduationDto } from './dtos';

@Controller('webhooks')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(private readonly webhookService: WebhookService) {}

  private validateKey(headers: any) {
    const apiKey = headers['x-api-key'];
    if (apiKey !== process.env.SOIS_API_KEY) {
      this.logger.warn(`Unauthorized access attempt with key: ${apiKey}`);
      throw new UnauthorizedException('Invalid API Key');
    }
  }

  @Post('admission')
  @HttpCode(200)
  async handleAdmission(@Body() dto: CreateAdmissionDto, @Headers() headers: any) {
    this.validateKey(headers);
    return this.webhookService.handleAdmission(dto);
  }

  @Post('payment')
  @HttpCode(200)
  async handlePayment(@Body() dto: CreatePaymentDto, @Headers() headers: any) {
    this.validateKey(headers);
    return this.webhookService.handlePayment(dto);
  }

  @Post('course-registration')
  @HttpCode(200)
  async handleCourseRegistration(@Body() dto: BulkRegistrationDto, @Headers() headers: any) {
    this.validateKey(headers);
    return this.webhookService.handleCourseRegistration(dto);
  }

  @Post('course-drop')
  @HttpCode(200)
  async handleCourseDrop(@Body() dto: any, @Headers() headers: any) {
    this.validateKey(headers);
    return this.webhookService.handleCourseDrop(dto);
  }

  @Post('result-publication')
  @HttpCode(200)
  async handleResultPublication(@Body() dto: ResultPublicationDto, @Headers() headers: any) {
    this.validateKey(headers);
    return this.webhookService.handleResultPublication(dto);
  }

  @Post('semester-enrolment')
  @HttpCode(200)
  async handleSemesterEnrolment(@Body() dto: SemesterEnrolmentDto, @Headers() headers: any) {
    this.validateKey(headers);
    return this.webhookService.handleSemesterEnrolment(dto);
  }

  @Post('semester-drop')
  @HttpCode(200)
  async handleSemesterDrop(@Body() dto: SemesterDropDto, @Headers() headers: any) {
    this.validateKey(headers);
    return this.webhookService.handleSemesterDrop(dto);
  }

  @Post('graduation')
  @HttpCode(200)
  async handleGraduation(@Body() dto: GraduationDto, @Headers() headers: any) {
    this.validateKey(headers);
    return this.webhookService.handleGraduation(dto);
  }
}
