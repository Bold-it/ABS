import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get('health')
  getHealth() {
    return {
      status: 'ok',
      message: 'Auto Bridge Service is running',
      timestamp: new Date().toISOString(),
    };
  }
}
