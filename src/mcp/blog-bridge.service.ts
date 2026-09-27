import { Injectable, Logger } from '@nestjs/common';

export const BLOG_TOOL_NAMES = [
  'list_my_posts',
  'get_my_post',
  'create_post',
  'update_post',
  'publish_post',
  'delete_post',
] as const;

export type BlogToolName = (typeof BLOG_TOOL_NAMES)[number];

interface BlogToolDefinition {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

export interface McpToolResult {
  content: Array<Record<string, unknown>>;
  isError?: boolean;
  [key: string]: unknown;
}

interface StandardSchema {
  '~standard': {
    version: 1;
    vendor: string;
    validate: (value: unknown) => { value: unknown };
    jsonSchema: {
      input: () => Record<string, unknown>;
      output: () => Record<string, unknown>;
    };
  };
}

@Injectable()
export class BlogBridgeService {

  private readonly logger = new Logger(BlogBridgeService.name);
  private readonly blogAppUrl = (process.env.BLOG_APP_URL ?? 'http://127.0.0.1:3001').replace(/\/$/, '');
  private readonly bridgeSecret = process.env.MCP_BRIDGE_SECRET;
  private readonly requestTimeoutMs = 10_000;

  private toolDefinitions: BlogToolDefinition[] = [];

  async initialize(): Promise<void> {
    this.logger.log(`Discovering blog tools from ${this.blogAppUrl}/api/mcp/tools`);
    if (!this.bridgeSecret) {
      this.logger.error('MCP_BRIDGE_SECRET is missing');
      throw new Error('MCP_BRIDGE_SECRET is required to connect to the blog app bridge');
    }

    const response = await this.request('/api/mcp/tools', { method: 'GET' });

    this.logger.log(`Blog tool discovery returned HTTP ${response.status}`);
    
    const payload = (await response.json()) as BlogToolDefinition[] | { tools?: BlogToolDefinition[] };
    const definitions = Array.isArray(payload) ? payload : payload.tools ?? [];
    const byName = new Map(definitions.map((tool) => [tool.name, tool]));
    const missing = BLOG_TOOL_NAMES.filter((name) => !byName.has(name));

    if (missing.length > 0) {
      this.logger.error(`Blog app is missing required tools: ${missing.join(', ')}`);
      throw new Error(`Blog app did not expose required MCP tools: ${missing.join(', ')}`);
    }

    this.toolDefinitions = BLOG_TOOL_NAMES.map((name) => byName.get(name)!);
    this.logger.log(`Registered ${this.toolDefinitions.length} proxied blog tools`);
  }

  get tools(): readonly BlogToolDefinition[] {
    return this.toolDefinitions;
  }

  async call(name: BlogToolName, args: unknown, userId?: string): Promise<McpToolResult> {
    if (!userId) {
      return {
        content: [{ type: 'text', text: 'Missing authenticated user identity. Provide the x-user-id header.' }],
        isError: true,
      };
    }

    try {
      const response = await this.request('/api/mcp/tools/call', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-user-id': userId },
        body: JSON.stringify({ name, arguments: args }),
      });
      return (await response.json()) as McpToolResult;
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Blog app unavailable: ${error instanceof Error ? error.message : String(error)}` }],
        isError: true,
      };
    }
  }

  schema(inputSchema: Record<string, unknown>): StandardSchema {
    return {
      '~standard': {
        version: 1,
        vendor: 'crownstack-blog-bridge',
        validate: (value) => ({ value }),
        jsonSchema: {
          input: () => inputSchema,
          output: () => inputSchema,
        },
      },
    };
  }

  private async request(path: string, init: RequestInit): Promise<Response> {

    this.logger.debug(`${init.method ?? 'GET'} ${this.blogAppUrl}${path}`);

    const signal = AbortSignal.timeout(this.requestTimeoutMs);
    const headers = new Headers(init.headers);

    headers.set('x-mcp-bridge-secret', this.bridgeSecret ?? '');
    let response: Response;
    try {
      response = await fetch(`${this.blogAppUrl}${path}`, { ...init, headers, signal });
    } catch (error) {
      this.logger.error(`Blog bridge request failed: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }

    if (!response.ok) {
      const body = await response.text();
      this.logger.error(`Blog bridge returned HTTP ${response.status}: ${body}`);
      if (response.status === 401) {
        throw new Error('Blog app rejected MCP_BRIDGE_SECRET. Set it to the exact value from the blog app backend/.env.');
      }
      throw new Error(`Blog app returned HTTP ${response.status}: ${body || response.statusText}`);
    }
    return response;
  }
}