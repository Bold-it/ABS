(global as any).crypto = require('crypto');
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import * as express from 'express';
import { join } from 'path';
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

function cleanCorruptedBuildFolders(staticDir: string) {
  try {
    const nextDir = join(staticDir, '_next');
    if (!fs.existsSync(nextDir)) return;

    const items = fs.readdirSync(nextDir);
    for (const item of items) {
      if (item !== 'static' && !item.startsWith('__')) {
        const itemPath = join(nextDir, item);
        try {
          if (fs.statSync(itemPath).isDirectory()) {
            console.log(`[ABS Auto-Cleaner] Removing stale build folder: ${itemPath}`);
            fs.rmSync(itemPath, { recursive: true, force: true });
          }
        } catch (e) {}
      }
    }
  } catch (err) {
    console.error('[ABS Auto-Cleaner Error]', err);
  }
}

async function bootstrap() {
  cleanCorruptedBuildFolders(join(process.cwd(), 'out'));
  cleanCorruptedBuildFolders(join(process.cwd(), 'public'));

  const app = await NestFactory.create(AppModule);
  const expressApp = app.getHttpAdapter().getInstance();

  app.setGlobalPrefix('api', { exclude: ['/'] });
  app.enableCors();
  app.useGlobalPipes(new ValidationPipe({ transform: true }));

  // 1. RAW EXPRESS STATIC ASSET SERVING FOR /_NEXT (Prevents any 500 errors on static assets)
  const nextDirs = [
    join(process.cwd(), 'out', '_next'),
    join(process.cwd(), 'public', '_next'),
    join(__dirname, '..', 'out', '_next'),
    join(__dirname, '..', 'public', '_next'),
    join(process.cwd(), 'dashboard', 'out', '_next'),
  ];

  for (const nextDir of nextDirs) {
    if (fs.existsSync(nextDir)) {
      console.log(`[ABS] Mounting /_next static dir: ${nextDir}`);
      expressApp.use('/_next', express.static(nextDir, {
        maxAge: '1y',
        immutable: true,
        fallthrough: true,
      }));
    }
  }

  // 2. FAIL-SAFE 404 INTERCEPTOR FOR MISSING /_NEXT CHUNKS (Guarantees clean 404 text, NEVER 500!)
  expressApp.use('/_next', (req: any, res: any) => {
    res.status(404).type('text/plain').send('Next.js static chunk not found');
  });

  // 3. RAW EXPRESS STATIC SERVING FOR PUBLIC ROOT FILES (logo.png, index.html, etc.)
  const staticRoot = getStaticRootPath();
  if (fs.existsSync(staticRoot)) {
    expressApp.use(express.static(staticRoot, { fallthrough: true }));
  }

  const port = process.env.PORT || 'passenger';
  await app.listen(port);
  console.log(`[ABS] Server started on port/socket: ${port}`);
}
bootstrap();
