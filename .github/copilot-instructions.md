# MCP server notes

This project uses the official [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) and its [`McpServer`](https://modelcontextprotocol.io/docs/get-started/intro) and stdio serving APIs.

Keep protocol messages on stdout. Operational logs should go to stderr so they do not corrupt the MCP stdio stream.
