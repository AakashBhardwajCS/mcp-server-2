import 'reflect-metadata';
import 'dotenv/config';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { McpService } from './mcp/mcp.service.js';

async function bootstrap(): Promise<void> {

  const logger = new Logger('Bootstrap');

  logger.log(`Starting MCP server with transport=${process.env.MCP_TRANSPORT ?? 'stdio'}`);
  logger.log(`Blog app URL: ${process.env.BLOG_APP_URL ?? 'http://127.0.0.1:3001'}`);
  logger.log(`Bridge secret configured: ${Boolean(process.env.MCP_BRIDGE_SECRET)}`);

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'error', 'warn', 'debug'],
  });

  logger.log('Nest application context initialized');

  const mcpService = app.get(McpService);

  if (process.env.MCP_TRANSPORT === 'http') {

    const port = Number(process.env.PORT ?? 3002);
    // if (!Number.isInteger(port) || port < 1 || port > 65535) {
    //   throw new Error('PORT must be an integer between 1 and 65535');
    // }
    logger.log(`Starting HTTP transport on port ${port}`);

    mcpService.startHttp(port);
    logger.log(`MCP server running over HTTP at http://127.0.0.1:${port}/mcp`);
  } else {
    logger.log('Starting stdio transport');
    mcpService.start();
      logger.log('MCP server running over stdio and waiting for a client');
  }

  const shutdown = async (): Promise<void> => {
    await app.close();
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  
}

void bootstrap().catch((error: unknown) => {

  const logger = new Logger('Bootstrap');
  logger.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
  
});
