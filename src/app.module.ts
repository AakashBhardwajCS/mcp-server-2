import { Module } from '@nestjs/common';

import { McpService } from './mcp/mcp.service.js';
import { BlogBridgeService } from './mcp/blog-bridge.service.js';
import { WebSearchService } from './web_search/web-search.service.js';

@Module({
  providers: [WebSearchService, BlogBridgeService, McpService],
})

export class AppModule {}
