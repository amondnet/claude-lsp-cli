#!/usr/bin/env bun

/**
 * Claude LSP CLI - Hook handler for Claude Code
 * 
 * Usage:
 *   claude-lsp-cli hook <event-type>  - Handle Claude Code hook events
 *   claude-lsp-cli diagnostics <project> [file] - Query diagnostics directly
 * 
 * This CLI acts as the entry point for Claude Code hooks and manages
 * the LSP server lifecycle and diagnostics.
 */

import { secureHash } from "./utils/security";
import { logger } from "./utils/logger";
import { resolve } from "path";

// Parse command line arguments
const args = process.argv.slice(2);
const command = args[0];
const eventType = args[1];

async function handleHookEvent(eventType: string) {
  // For hook events, we need to run the diagnostics logic
  // Spawn diagnostics binary or script as a subprocess and pipe stdin
  try {
    // Try multiple paths to find diagnostics executable
    const possiblePaths = [
      // In same directory as the CLI binary (most common in production)
      process.argv[0]?.replace(/claude-lsp-cli$/, "claude-lsp-diagnostics"),
      // Fallback to common locations
      "/usr/local/bin/claude-lsp-diagnostics",
      `${process.env.HOME}/Downloads/repos/claude-code-lsp/bin/claude-lsp-diagnostics`,
      // When running from source (development)
      new URL("./diagnostics.ts", import.meta.url).pathname,
      // Relative to binary location (development)
      new URL("../src/diagnostics.ts", import.meta.url).pathname,
    ];

    let diagnosticsPath: string | null = null;
    let needsBun = false;

    for (const path of possiblePaths) {
      try {
        if (path && (await Bun.file(path).exists())) {
          diagnosticsPath = path;
          // Check if it's a TypeScript file that needs Bun
          needsBun = path.endsWith(".ts");
          break;
        }
      } catch (error) {
        await logger.debug("Path check failed", { path, error });
      }
    }
    
    if (!diagnosticsPath) {
      throw new Error("Could not find diagnostics executable or script");
    }
    
    // Read stdin for hook data
    const stdinData = await Bun.stdin.text();
    
    // Spawn diagnostics with appropriate runner
    const command = needsBun ? ["bun", diagnosticsPath, eventType] : [diagnosticsPath, eventType];
    const proc = Bun.spawn(command, {
      stdin: "pipe",
      stdout: "inherit",
      stderr: "inherit",
    });
    
    // Write stdin data to the subprocess
    if (proc.stdin) {
      proc.stdin.write(stdinData);
      proc.stdin.end();
    }
    
    // Wait for the process to complete
    await proc.exited;
    
    // Exit with the same code as the subprocess
    process.exit(proc.exitCode || 0);
    
  } catch (error) {
    await logger.error('Hook handler error', error, { eventType });
    console.error(JSON.stringify({
      error: "HOOK_HANDLER_ERROR", 
      eventType,
      message: error instanceof Error ? error.message : "Unknown error"
    }));
    process.exit(1);
  }
}

async function queryDiagnostics(projectRoot: string, filePath?: string) {
  // Generate project hash using SHA-256
  const projectHash = secureHash(projectRoot).substring(0, 16);
  
  // Determine socket directory based on platform
  const socketDir = process.env.XDG_RUNTIME_DIR || 
                   (process.platform === 'darwin' 
                     ? `${process.env.HOME}/Library/Application Support/claude-lsp/run`
                     : `${process.env.HOME}/.claude-lsp/run`);
  
  const socketPath = `${socketDir}/claude-lsp-${projectHash}.sock`;
  
  try {
    // Query the LSP server via Unix socket
    const url = filePath 
      ? `http://localhost/diagnostics?file=${encodeURIComponent(filePath)}`
      : `http://localhost/diagnostics/all`;
    
    const response = await fetch(url, { 
      // @ts-ignore - Bun supports unix option
      unix: socketPath,
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      if (response.status === 429) {
        console.error("Rate limit exceeded. Please wait before trying again.");
      } else {
        console.error(`Server error: ${response.status} ${response.statusText}`);
      }
      process.exit(1);
    }
    
    const data = await response.json();
    console.log(JSON.stringify(data, null, 2));
    
  } catch (error) {
    await logger.error('Failed to query diagnostics', error, { projectRoot, filePath });
    console.error(JSON.stringify({
      error: "DIAGNOSTICS_QUERY_ERROR",
      message: error instanceof Error ? error.message : "Unknown error",
      hint: "Is the LSP server running? Try starting it first."
    }));
    process.exit(1);
  }
}

function showHelp() {
  console.log(`
Claude LSP CLI - Language Server Protocol client for Claude Code

Usage:
  claude-lsp-cli hook <event-type>           Handle Claude Code hook events
  claude-lsp-cli diagnostics <project> [file] Query diagnostics directly
  claude-lsp-cli status [project]            Show running LSP servers
  claude-lsp-cli start <project>             Start LSP server for project
  claude-lsp-cli stop <project>              Stop LSP server for project
  claude-lsp-cli kill-all                    Kill all running LSP servers
  claude-lsp-cli help                        Show this help message

Hook Event Types:
  PreToolUse     - Before tool execution  
  PostToolUse    - After tool execution (main use case)
  SessionStart   - When session starts
  
Examples:
  # Handle PostToolUse hook (called by Claude Code)
  claude-lsp-cli hook PostToolUse
  
  # Query all diagnostics for a project
  claude-lsp-cli diagnostics /path/to/project
  
  # Show running servers
  claude-lsp-cli status
  
  # Start server for specific project
  claude-lsp-cli start /path/to/project
  
  # Stop server for specific project
  claude-lsp-cli stop /path/to/project
  
  # Kill all LSP servers
  claude-lsp-cli kill-all

Configuration:
  The CLI reads hook data from stdin when handling hook events.
  For direct queries, it connects to the LSP server via Unix socket.
  
Environment Variables:
  LOG_LEVEL      - Set logging level (ERROR, WARN, INFO, DEBUG)
  CLAUDE_HOME    - Claude home directory (default: ~/.claude)
`);
}

async function showStatus(projectRoot?: string) {
  // Determine socket directory based on platform
  const socketDir = process.env.XDG_RUNTIME_DIR || 
                   (process.platform === 'darwin' 
                     ? `${process.env.HOME}/Library/Application Support/claude-lsp/run`
                     : `${process.env.HOME}/.claude-lsp/run`);

  try {
    const { readdir } = await import("fs/promises");
    const files = await readdir(socketDir).catch(() => []);
    const sockets = files.filter(f => f.startsWith('claude-lsp-') && f.endsWith('.sock'));
    
    if (sockets.length === 0) {
      console.log("No LSP servers running");
      return;
    }
    
    console.log("Running LSP servers:");
    for (const socket of sockets) {
      const hash = socket.replace('claude-lsp-', '').replace('.sock', '');
      
      // Try to get server info
      try {
        const response = await fetch('http://localhost/health', { 
          unix: `${socketDir}/${socket}`
        });
        if (response.ok) {
          const data = await response.json() as any;
          console.log(`  ${hash}: healthy (uptime: ${Math.floor(data.uptime || 0)}s)`);
        } else {
          console.log(`  ${hash}: unhealthy`);
        }
      } catch (error) {
        console.log(`  ${hash}: not responding`);
      }
    }
  } catch (error) {
    console.error("Failed to check server status:", error);
  }
}

async function startServer(projectRoot: string) {
  const absolutePath = resolve(projectRoot);
  const projectHash = secureHash(absolutePath).substring(0, 16);
  
  // Check if already running
  const socketDir = process.env.XDG_RUNTIME_DIR || 
                   (process.platform === 'darwin' 
                     ? `${process.env.HOME}/Library/Application Support/claude-lsp/run`
                     : `${process.env.HOME}/.claude-lsp/run`);
  
  try {
    const response = await fetch('http://localhost/health', { 
      unix: `${socketDir}/claude-lsp-${projectHash}.sock`
    });
    if (response.ok) {
      console.log(`LSP server already running for project: ${absolutePath}`);
      return;
    }
  } catch (error) {
    // Server not running, start it
  }
  
  // Start the server
  const serverPath = process.env.CLAUDE_LSP_SERVER_PATH || './bin/claude-lsp-server';
  console.log(`Starting LSP server for project: ${absolutePath}`);
  
  const proc = Bun.spawn([serverPath, absolutePath], {
    stdio: ["ignore", "pipe", "pipe"]
  });
  
  // Unref to allow CLI to exit
  proc.unref();
  
  console.log(`LSP server started (PID: ${proc.pid})`);
}

async function stopServer(projectRoot: string) {
  const absolutePath = resolve(projectRoot);
  const projectHash = secureHash(absolutePath).substring(0, 16);
  
  const socketDir = process.env.XDG_RUNTIME_DIR || 
                   (process.platform === 'darwin' 
                     ? `${process.env.HOME}/Library/Application Support/claude-lsp/run`
                     : `${process.env.HOME}/.claude-lsp/run`);
  
  try {
    const response = await fetch('http://localhost/shutdown', { 
      method: 'POST',
      unix: `${socketDir}/claude-lsp-${projectHash}.sock`
    });
    
    if (response.ok) {
      console.log(`LSP server stopped for project: ${absolutePath}`);
    } else {
      console.log("Server not responding to shutdown request");
    }
  } catch (error) {
    console.log("Server not running or already stopped");
  }
}

async function killAllServers() {
  const socketDir = process.env.XDG_RUNTIME_DIR || 
                   (process.platform === 'darwin' 
                     ? `${process.env.HOME}/Library/Application Support/claude-lsp/run`
                     : `${process.env.HOME}/.claude-lsp/run`);

  try {
    const { readdir } = await import("fs/promises");
    const files = await readdir(socketDir).catch(() => []);
    const sockets = files.filter(f => f.startsWith('claude-lsp-') && f.endsWith('.sock'));
    
    let stopped = 0;
    for (const socket of sockets) {
      try {
        const response = await fetch('http://localhost/shutdown', { 
          method: 'POST',
          unix: `${socketDir}/${socket}`
        });
        if (response.ok) stopped++;
      } catch (error) {
        // Server already dead
      }
    }
    
    console.log(`Stopped ${stopped} LSP servers`);
  } catch (error) {
    console.error("Failed to stop servers:", error);
  }
}

// Main execution
if (command === "hook" && eventType) {
  await handleHookEvent(eventType);
} else if (command === "diagnostics" && args[1]) {
  const projectRoot = resolve(args[1]);
  const filePath = args[2] ? resolve(args[2]) : undefined;
  await queryDiagnostics(projectRoot, filePath);
} else if (command === "status") {
  const projectRoot = args[1] ? resolve(args[1]) : undefined;
  await showStatus(projectRoot);
} else if (command === "start" && args[1]) {
  await startServer(args[1]);
} else if (command === "stop" && args[1]) {
  await stopServer(args[1]);
} else if (command === "kill-all") {
  await killAllServers();
} else if (command === "help" || command === "--help" || command === "-h") {
  showHelp();
} else {
  console.error("Invalid command. Use 'claude-lsp-cli help' for usage information.");
  showHelp();
  process.exit(1);
}