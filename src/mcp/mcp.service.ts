import { Injectable, Inject, Logger, OnModuleInit } from '@nestjs/common';
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { createMcpHonoApp } from '@modelcontextprotocol/hono';
import { serve } from '@hono/node-server';
import { z } from 'zod';

import { WebSearchService } from '../web_search/web-search.service.js';
import { BlogBridgeService, BlogToolName } from './blog-bridge.service.js';

@Injectable()
export class McpService implements OnModuleInit {
  private readonly logger = new Logger(McpService.name);
  constructor(
    @Inject(WebSearchService)
    private readonly webSearchService: WebSearchService,
    @Inject(BlogBridgeService)
    private readonly blogBridgeService: BlogBridgeService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.logger.log('Initializing MCP tool registry');
    await this.blogBridgeService.initialize();
    this.logger.log('MCP tool registry initialized');
  }

  private createServer(userId?: string): McpServer {
    const server = new McpServer({ name: 'nest-websearch', version: '0.1.0' });
    server.registerTool(
      'websearch',
      {
        description: 'Search the public web and return relevant result links and snippets.',
        inputSchema: z.object({
          query: z.string().min(1).describe('The web search query'),
          maxResults: z.number().int().min(1).max(10).default(5).describe('Maximum number of results'),
        }),
      },
      async ({ query, maxResults }) => {
        const results = await this.webSearchService.search(query, maxResults);
        return {
          content: [{ type: 'text', text: JSON.stringify({ query, results }, null, 2) }],
        };
      },
    );
    for (const tool of this.blogBridgeService.tools) {
      server.registerTool(
        tool.name,
        {
          description: tool.description,
          inputSchema: this.blogBridgeService.schema(tool.inputSchema) as any,
        },
        async (args: unknown) => {
          this.logger.log(`Incoming MCP tool call: ${tool.name} userIdPresent=${Boolean(userId)}`);
          const result = await this.blogBridgeService.call(tool.name as BlogToolName, args, userId) as any;
          this.logger.log(`MCP tool result: ${tool.name} isError=${Boolean(result.isError)}`);
          return result;
        },
      );
    }
    return server;
  }

  start(): void {
    serveStdio(() => this.createServer());
  }

  startHttp(port: number): void {
    this.logger.log(`Creating MCP HTTP handler for port ${port}`);
    const handler = createMcpHandler((context) => {
      const userId = context.requestInfo?.headers.get('x-user-id') ?? undefined;
      return this.createServer(userId);
    });
    const app = createMcpHonoApp();
    app.all('/mcp', async (context) => {
      const startedAt = Date.now();
      const request = context.req.raw;
      const hasUserId = Boolean(request.headers.get('x-user-id'));
      this.logger.log(`Incoming MCP request: ${request.method} ${new URL(request.url).pathname} userIdPresent=${hasUserId}`);

      try {
        const response = await handler.fetch(request);
        this.logger.log(`MCP response: ${request.method} ${response.status} durationMs=${Date.now() - startedAt}`);
        return response;
      } catch (error) {
        this.logger.error(
          `MCP request failed: ${request.method} durationMs=${Date.now() - startedAt} ${error instanceof Error ? error.message : String(error)}`,
        );
        throw error;
      }
    });

    serve({ fetch: app.fetch, hostname: '127.0.0.1', port }, (info) => {
      console.error(`MCP HTTP server listening at http://${info.address}:${info.port}/mcp`);
    });
  }
}
