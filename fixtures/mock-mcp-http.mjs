#!/usr/bin/env node
/**
 * Mock MCP server over Streamable HTTP (JSON responses, sessionless).
 *
 * Test fixture for dsh-mcp-manager ONLY — not part of the plugin bundle.
 * It implements just enough of the MCP Streamable HTTP transport for
 * @deepseek-ai/dsh-mcp-client to connect over `streamable-http`, list tools
 * with descriptions, and call them.
 *
 * Usage:  node mock-mcp-http.mjs [port]      (default 8791, path /mcp)
 */

import { createServer } from "node:http";

const PORT = Number(process.argv[2] ?? 8791);
const PATH = "/mcp";

const TOOLS = [
  {
    name: "http_echo",
    description: "Echo the provided text back, over Streamable HTTP.",
    inputSchema: {
      type: "object",
      properties: { text: { type: "string", description: "Text to echo back." } },
      required: ["text"],
    },
  },
  {
    name: "http_mood",
    description: "Report the mock server's mood as structured text.",
    inputSchema: { type: "object", properties: {} },
  },
];

function reply(id, result) {
  return { jsonrpc: "2.0", id, result };
}

function failure(id, code, message) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function callTool(name, args) {
  switch (name) {
    case "http_echo":
      return { content: [{ type: "text", text: `http-echo: ${String(args?.text ?? "")}` }] };
    case "http_mood":
      return { content: [{ type: "text", text: "calm and stateless" }] };
    default:
      throw new Error(`unknown tool: ${name}`);
  }
}

function handle(message) {
  const { id, method, params } = message;
  switch (method) {
    case "initialize":
      return reply(id, {
        protocolVersion: params?.protocolVersion ?? "2025-06-18",
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "mock-mcp-http", version: "0.1.0" },
      });
    case "ping":
      return reply(id, {});
    case "tools/list":
      return reply(id, { tools: TOOLS });
    case "tools/call": {
      try {
        return reply(id, callTool(params?.name, params?.arguments));
      } catch (error) {
        return reply(id, { isError: true, content: [{ type: "text", text: String(error?.message ?? error) }] });
      }
    }
    case "resources/list":
      return reply(id, { resources: [] });
    case "resources/templates/list":
      return reply(id, { resourceTemplates: [] });
    case "prompts/list":
      return reply(id, { prompts: [] });
    default:
      return failure(id, -32601, `method not found: ${method}`);
  }
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);

  if (url.pathname !== PATH) {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
    return;
  }

  if (req.method === "GET") {
    // No server-initiated SSE stream on this mock.
    res.writeHead(405, { allow: "POST, DELETE" });
    res.end();
    return;
  }

  if (req.method === "DELETE") {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.method !== "POST") {
    res.writeHead(405, { allow: "POST, DELETE" });
    res.end();
    return;
  }

  const chunks = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", () => {
    let message;
    try {
      message = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } }));
      return;
    }

    const batch = Array.isArray(message) ? message : [message];

    // Notifications carry no id and get no body.
    const isNotificationOnly = batch.every((item) => item?.id === undefined || item?.id === null);
    if (isNotificationOnly) {
      res.writeHead(202);
      res.end();
      return;
    }

    const responses = batch
      .filter((item) => item?.id !== undefined && item?.id !== null)
      .map((item) => handle(item));
    const payload = Array.isArray(message) ? responses : responses[0];

    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(payload));
  });
});

server.listen(PORT, "127.0.0.1", () => {
  process.stdout.write(`mock-mcp-http listening on http://127.0.0.1:${PORT}${PATH}\n`);
});
