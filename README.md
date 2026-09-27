# NestJS MCP Web Search Server

A TypeScript MCP server using NestJS for dependency injection and the official MCP TypeScript SDK.

## Requirements

- Node.js 18.18 or newer

## Setup

Copy `.env.example` to `.env` and set `MCP_BRIDGE_SECRET` to the same value as the blog app's `backend/.env`. The HTTP server will not start without this shared secret.

```bash
npm install
npm run build
npm start
```

To run the MCP server over HTTP on port `3002`:

```bash
npm run start:http
```

The MCP endpoint is `http://127.0.0.1:3002/mcp`. Set `PORT` to use a different port.

The server exposes a `websearch` tool with `query` and optional `maxResults` (1-10) arguments. It uses DuckDuckGo's public Instant Answer API and does not require an API key.

The server also proxies `list_my_posts`, `get_my_post`, `create_post`, `update_post`, `publish_post`, and `delete_post` to the blog app. Blog validation, authorization, slugs, and persistence remain in the blog app.

## VS Code MCP configuration

The project includes `.vscode/mcp.json` for the HTTP endpoint. Start the HTTP server with `npm run start:http`, then use the configured MCP server from VS Code. The stdio mode remains available with `npm start`.
