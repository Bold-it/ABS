import { Controller, Get } from '@nestjs/common';
import * as fs from 'fs';
import { join } from 'path';

function listDirRecursively(dir: string, depth = 0, maxDepth = 6): any {
  if (depth > maxDepth || !fs.existsSync(dir)) return null;
  try {
    const stats = fs.statSync(dir);
    if (!stats.isDirectory()) return { type: 'file', size: stats.size };
    const items = fs.readdirSync(dir);
    const result: Record<string, any> = {};
    for (const item of items.slice(0, 30)) {
      const full = join(dir, item);
      result[item] = listDirRecursively(full, depth + 1, maxDepth);
    }
    return result;
  } catch (e: any) {
    return { error: e.message };
  }
}

@Controller()
export class AppController {

  @Get('health')
  getHealth() {
    return {
      status: 'ok',
      message: 'Auto Bridge Service is running',
      version: '2026-09-06-v3-fail-safe',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('debug-version')
  getDebugVersion() {
    return {
      version: '2026-09-06-v3-fail-safe',
      timestamp: new Date().toISOString(),
      nodeEnv: process.env.NODE_ENV,
    };
  }

  @Get('debug-status')
  getDebugStatus() {
    try {
      const cwd = process.cwd();
      const dirname = __dirname;

      const outTree = listDirRecursively(join(cwd, 'out'));
      const publicTree = listDirRecursively(join(cwd, 'public'));

      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        cwd,
        dirname,
        outTree,
        publicTree,
        env: {
          NODE_ENV: process.env.NODE_ENV,
          PORT: process.env.PORT,
          DB_HOST: process.env.DB_HOST,
          DB_USER: process.env.DB_USER,
          DB_NAME: process.env.DB_NAME,
        }
      };
    } catch (globalErr: any) {
      return {
        status: 'error',
        message: globalErr.message,
        stack: globalErr.stack,
      };
    }
  }
}
