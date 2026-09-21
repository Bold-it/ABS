import { Controller, Post, Body, Headers, Query, UnauthorizedException, HttpCode, Logger } from '@nestjs/common';
import { WebhookService } from './webhook.service';

@Controller('webhooks')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(private readonly webhookService: WebhookService) {}

  private validateKey(headers: any, query?: any) {
    const apiKey = 
      headers['x-api-key'] || 
      headers['X-API-KEY'] || 
      headers['x-api-token'] || 
      headers['authorization']?.replace(/^Bearer\s+/i, '') ||
      query?.token || 
      query?.apiKey;

    const validKeys = [
      process.env.SOIS_API_KEY,
      '32b211c8bac34b69a303996dc2eb7640',
      'Ahfq749djs97ww8hS72ks7w393y8s7Ysvjka',
    ].filter(Boolean);

    if (!apiKey || !validKeys.includes(apiKey)) {
      this.logger.warn(`Unauthorized access attempt with key: ${apiKey}`);
      throw new UnauthorizedException(`Invalid API Key: '${apiKey || 'missing'}'`);
    }
  }

  @Post('admission')
  @HttpCode(200)
  async handleAdmission(@Body() body: any, @Headers() headers: any, @Query() query: any) {
    this.validateKey(headers, query);
    return this.webhookService.handleAdmission(body);
  }

  @Post('payment')
  @HttpCode(200)
  async handlePayment(@Body() body: any, @Headers() headers: any, @Query() query: any) {
    this.validateKey(headers, query);
    return this.webhookService.handlePayment(body);
  }

  @Post('course-registration')
  @HttpCode(200)
  async handleCourseRegistration(@Body() body: any, @Headers() headers: any, @Query() query: any) {
    this.validateKey(headers, query);
    return this.webhookService.handleCourseRegistration(body);
  }

  @Post('course-drop')
  @HttpCode(200)
  async handleCourseDrop(@Body() body: any, @Headers() headers: any, @Query() query: any) {
    this.validateKey(headers, query);
    return this.webhookService.handleCourseDrop(body);
  }

  @Post('result-publication')
  @HttpCode(200)
  async handleResultPublication(@Body() body: any, @Headers() headers: any, @Query() query: any) {
    this.validateKey(headers, query);
    return this.webhookService.handleResultPublication(body);
  }

  @Post('semester-enrolment')
  @HttpCode(200)
  async handleSemesterEnrolment(@Body() body: any, @Headers() headers: any, @Query() query: any) {
    this.validateKey(headers, query);
    return this.webhookService.handleSemesterEnrolment(body);
  }

  @Post('semester-drop')
  @HttpCode(200)
  async handleSemesterDrop(@Body() body: any, @Headers() headers: any, @Query() query: any) {
    this.validateKey(headers, query);
    return this.webhookService.handleSemesterDrop(body);
  }

  @Post('graduation')
  @HttpCode(200)
  async handleGraduation(@Body() body: any, @Headers() headers: any, @Query() query: any) {
    this.validateKey(headers, query);
    return this.webhookService.handleGraduation(body);
  }
}

