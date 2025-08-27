#!/usr/bin/env bun
/**
 * CLI interface for the LSP Manager
 * Provides command-line access to manager.ts functionality
 */

import { 
  findProjectRoot, 
  startLSPServer, 
  isLSPRunning, 
  getDiagnostics, 
  autoStart,
  stopLSPServer
} from './manager';

const command = process.argv[2];
const path = process.argv[3] || process.cwd();

async function main() {
  switch (command) {
    case "start": {
      const projectInfo = findProjectRoot(path);
      if (projectInfo) {
        await startLSPServer(projectInfo);
      } else {
        console.log("No project found at", path);
      }
      break;
    }
    
    case "auto": {
      // Auto-start for edited file
      await autoStart(path);
      break;
    }
    
    case "check": {
      const projectInfo = findProjectRoot(path);
      if (projectInfo) {
        const running = await isLSPRunning(projectInfo.hash);
        console.log(`LSP server for ${projectInfo.root}: ${running ? "RUNNING" : "NOT RUNNING"}`);
      } else {
        console.log("No project found at", path);
      }
      break;
    }
    
    case "diagnostics": {
      const projectInfo = findProjectRoot(path);
      if (projectInfo) {
        const file = process.argv[4];
        const diagnostics = await getDiagnostics(projectInfo.hash, file);
        console.log(JSON.stringify(diagnostics));
      } else {
        console.log("No project found at", path);
      }
      break;
    }
    
    case "stop": {
      const projectInfo = findProjectRoot(path);
      if (projectInfo) {
        await stopLSPServer(projectInfo);
      } else {
        console.log("No project found at", path);
      }
      break;
    }
    
    default: {
      console.log(`
Real LSP Manager - Manages actual Language Server Protocol servers

Usage: bun manager-cli.ts <command> [path]

Commands:
  start [path]       - Start LSP server for project at path
  auto [file]        - Auto-start LSP server for edited file's project
  check [path]       - Check if LSP server is running
  diagnostics [path] [file] - Get diagnostics from LSP server
  stop [path]        - Stop LSP server for project

The LSP servers provide:
  - Real incremental validation (only changed files)
  - TypeScript language server for .ts/.tsx/.js/.jsx
  - Pyright language server for .py files
  - Instant feedback via Language Server Protocol
      `);
    }
  }
}

main().catch(console.error);