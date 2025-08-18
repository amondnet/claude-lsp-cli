#!/usr/bin/env bun

import { spawn } from "child_process";
import * as rpc from "vscode-jsonrpc/node";

// Start TypeScript Language Server
const serverProcess = spawn("bun", ["x", "typescript-language-server", "--stdio"], {
  cwd: "/Users/steven_chong/.claude/claude-code-lsp",
  env: { ...process.env }
});

const connection = rpc.createMessageConnection(
  new rpc.StreamMessageReader(serverProcess.stdout!),
  new rpc.StreamMessageWriter(serverProcess.stdin!)
);

// Listen for errors
serverProcess.stderr?.on('data', (data) => {
  console.error('Server error:', data.toString());
});

connection.onError((error) => {
  console.error('Connection error:', error);
});

connection.listen();

// Simple initialize request
const initParams = {
  processId: process.pid,
  rootUri: `file:///Users/steven_chong/Downloads/repos/kepler_app_testhooks`,
  capabilities: {},
  workspaceFolders: [{
    uri: `file:///Users/steven_chong/Downloads/repos/kepler_app_testhooks`,
    name: "workspace"
  }]
};

console.log("Sending initialize request...");

// Send without the third parameter
connection.sendRequest("initialize", initParams).then(
  (result) => {
    console.log("Success! Server capabilities:", result.serverInfo);
    process.exit(0);
  },
  (error) => {
    console.error("Failed:", error);
    process.exit(1);
  }
);