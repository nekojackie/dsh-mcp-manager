#!/usr/bin/env node
/**
 * Mock MCP server (stdio, newline-delimited JSON-RPC 2.0).
 *
 * Test fixture for dsh-mcp-manager verification ONLY — not part of the plugin
 * bundle and not installed anywhere. It implements just enough of the MCP
 * server side for @deepseek-ai/dsh-mcp-client to connect, list two tools with
 * descriptions, and call them.
 *
 * Usage:  node mock-mcp-server.mjs
 */

import { createInterface } from "node:readline";

const TOOLS = [
  {
    name: "echo",
    description: "Echo the provided text back to the caller, prefixed with 'echo:'.",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to echo back." },
      },
      required: ["text"],
    },
  },
  {
    name: "add",
    description: "Add two numbers and return their sum.",
    inputSchema: {
      type: "object",
      properties: {
        a: { type: "number", description: "First addend." },
        b: { type: "number", description: "Second addend." },
      },
      required: ["a", "b"],
    },
  },
];

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function ok(id, result) {
  send({ jsonrpc: "2.0", id, result });
}

function fail(id, code, message) {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

function callTool(name, args) {
  switch (name) {
    case "echo":
      return { content: [{ type: "text", text: `echo: ${String(args?.text ?? "")}` }] };
    case "add":
      return {
        content: [
          {
            type: "text",
            text: String(Number(args?.a ?? 0) + Number(args?.b ?? 0)),
          },
        ],
      };
    default:
      throw new Error(`unknown tool: ${name}`);
  }
}

const rl = createInterface({ input: process.stdin, terminal: false });

rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  let message;
  try {
    message = JSON.parse(trimmed);
  } catch {
    send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } });
    return;
  }

  const { id, method, params } = message;
  const isRequest = id !== undefined && id !== null;

  try {
    switch (method) {
      case "initialize":
        ok(id, {
          protocolVersion: params?.protocolVersion ?? "2025-06-18",
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "mock-mcp", version: "0.1.0" },
        });
        break;
      case "ping":
        ok(id, {});
        break;
      case "tools/list":
        ok(id, { tools: TOOLS });
        break;
      case "tools/call": {
        const name = params?.name;
        try {
          ok(id, callTool(name, params?.arguments));
        } catch (error) {
          ok(id, {
            isError: true,
            content: [{ type: "text", text: String(error?.message ?? error) }],
          });
        }
        break;
      }
      case "resources/list":
        ok(id, { resources: [] });
        break;
      case "resources/templates/list":
        ok(id, { resourceTemplates: [] });
        break;
      case "prompts/list":
        ok(id, { prompts: [] });
        break;
      default:
        if (isRequest) fail(id, -32601, `method not found: ${method}`);
        break;
    }
  } catch (error) {
    if (isRequest) fail(id, -32603, String(error?.message ?? error));
  }
});

rl.on("close", () => process.exit(0));
