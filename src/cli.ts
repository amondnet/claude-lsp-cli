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
import { resolve, join } from "path";

async function runAsLanguageServer(language: string) {
  // This binary is now acting as a language server
  switch (language) {
    case 'typescript': {
      // TypeScript language server doesn't work with Bun's import() due to stdio handling
      // In development, we spawn it as a subprocess
      // TODO: For production binary, need a different approach
      const { spawn } = await import("child_process");
      
      try {
        // Use node to run the typescript-language-server
        const serverPath = join(import.meta.dir, '..', 'node_modules', '.bin', 'typescript-language-server');
        await logger.error(`DEBUG: Starting TypeScript server at: ${serverPath}\n`);
        const serverProcess = spawn('node', [serverPath, '--stdio'], {
          stdio: ['pipe', 'pipe', 'pipe']
        });
        
        // Pipe stdio
        process.stdin.pipe(serverProcess.stdin);
        serverProcess.stdout.pipe(process.stdout);
        serverProcess.stderr.pipe(process.stderr);
        
        serverProcess.on('exit', (code) => {
          process.exit(code || 0);
        });
        
        serverProcess.on('error', (error) => {
          console.error('Failed to start TypeScript language server:', error);
          process.exit(1);
        });
      } catch (error) {
        console.error('Failed to start TypeScript language server:', error);
        process.exit(1);
      }
      break;
    }
      
    case 'php':
      try {
        // Import and run the bundled PHP language server  
        const intelephense = await import('intelephense');
        // Set up stdio communication
        process.stdin.setEncoding('utf8');
        process.stdout.setEncoding('utf8');
        // Start the language server
        intelephense.default.start();
      } catch (error) {
        console.error('Failed to start PHP language server:', error);
        process.exit(1);
      }
      break;
      
    default:
      console.error(`Unknown language server: ${language}`);
      process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const command = args[0];
const eventType = args[1];


// Check if running as a language server
if (command === '--lang-server' && args[1]) {
  const language = args[1];
  await runAsLanguageServer(language);
  process.exit(0);
}

async function handleHookEvent(eventType: string) {
  // Set hook mode to suppress INFO/DEBUG logging to console
  process.env.CLAUDE_LSP_HOOK_MODE = 'true';
  
  // Exit codes based on Claude source code analysis:
  // 0 = success (no issues found)
  // 1 = error (hook failed to run properly)
  // 2 = blocking error (different behavior per hook type):
  //     - PreToolUse: blocks tool execution
  //     - PostToolUse: shows feedback but continues (perfect for diagnostics!)
  //     - UserPromptSubmit: blocks prompt submission
  const successExitCode = 0;
  const errorExitCode = 1;
  const feedbackExitCode = 2; // For PostToolUse: shows diagnostic feedback
  
  // Add timeout protection (30 seconds max)
  const timeoutId = setTimeout(() => {
    console.error(`[[system-message]]: ${JSON.stringify({
      status: "diagnostics_report",
      result: "timeout_error", 
      error: `Hook timed out after 30 seconds for event: ${eventType}`,
      reference: { type: "hook_timeout", event: eventType }
    })}`);
    process.exit(errorExitCode);
  }, 30000);
  
  try {
    // Import and run diagnostics logic directly
    const { handleHookEvent: handleDiagnostics } = await import("./diagnostics");
    
    // Run diagnostics with the event type
    const hasErrors = await handleDiagnostics(eventType);
    
    // Clear timeout on success
    clearTimeout(timeoutId);
    
    // For PostToolUse with errors, exit 2 to show feedback
    // For other hooks or no errors, exit 0
    if (eventType === 'PostToolUse' && hasErrors) {
      process.exit(feedbackExitCode); // Exit 2 shows feedback in Claude
    } else {
      process.exit(successExitCode);
    }
    
  } catch (error) {
    clearTimeout(timeoutId);
    await logger.error('Hook handler error', { eventType, error });
    
    // Format error as system message for Claude
    console.error(`[[system-message]]: ${JSON.stringify({
      status: "diagnostics_report",
      result: "hook_error",
      error: error instanceof Error ? error.message : "Unknown error",
      eventType,
      reference: { type: "hook_error", event: eventType }
    })}`);
    
    process.exit(errorExitCode);
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
  claude-lsp-cli install <language>          Install language server
  claude-lsp-cli install-all                 Install all supported language servers
  claude-lsp-cli list-servers                List available language servers
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

async function showStatus(_projectRoot?: string) {
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

async function installLanguageServer(language: string) {
  const { languageServers } = await import("./language-servers");
  const { spawn } = await import("child_process");
  
  const config = languageServers[language];
  if (!config) {
    console.error(`Unknown language: ${language}`);
    console.log("Use 'claude-lsp-cli list-servers' to see available languages");
    return;
  }
  
  console.log(`Installing ${config.name} Language Server...`);
  
  // Handle different installation methods
  if (config.installCheck === 'SKIP') {
    console.log("✅ This language server uses auto-download via bunx/npx - no installation needed");
    return;
  }
  
  if (config.installCommand === null && config.manualInstallUrl) {
    console.log(`❌ ${config.name} requires manual installation for security.`);
    console.log(`Please install from: ${config.manualInstallUrl}`);
    return;
  }
  
  if (!config.installCommand) {
    console.log(`❌ No installation method available for ${config.name}`);
    return;
  }
  
  // Parse and execute install command
  console.log(`Running: ${config.installCommand}`);
  const parts = config.installCommand.split(' ');
  const [cmd, ...args] = parts;
  
  const proc = spawn(cmd, args, {
    stdio: 'inherit',
    shell: false
  });
  
  proc.on('exit', (code) => {
    if (code === 0) {
      console.log(`✅ ${config.name} Language Server installed successfully!`);
    } else {
      console.error(`❌ Installation failed with exit code ${code}`);
    }
  });
}

async function installAllLanguageServers() {
  const { languageServers } = await import("./language-servers");
  
  const installable = Object.entries(languageServers)
    .filter(([_, config]) => 
      config.installCommand && 
      config.installCommand !== "Automatic - uses bunx cache" &&
      config.installCheck !== 'SKIP'
    );
  
  console.log(`Installing ${installable.length} language servers...`);
  
  for (const [language, config] of installable) {
    console.log(`\nInstalling ${config.name}...`);
    await installLanguageServer(language);
  }
  
  console.log("\n✅ Installation complete!");
}

async function listLanguageServers() {
  const { languageServers, isLanguageServerInstalled } = await import("./language-servers");
  
  console.log("\nAvailable Language Servers:");
  console.log("============================\n");
  
  const entries = Object.entries(languageServers).sort((a, b) => 
    a[1].name.localeCompare(b[1].name)
  );
  
  for (const [language, config] of entries) {
    const installed = isLanguageServerInstalled(language);
    const status = installed ? "✅ Installed" : "❌ Not installed";
    const autoDownload = config.installCheck === 'SKIP' ? " (auto-download)" : "";
    
    console.log(`${config.name.padEnd(25)} [${language}]`);
    console.log(`  Status: ${status}${autoDownload}`);
    console.log(`  Extensions: ${config.extensions.join(', ')}`);
    
    if (!installed && config.installCommand) {
      console.log(`  Install: claude-lsp-cli install ${language}`);
    }
    console.log();
  }
  
  console.log("To install a specific server: claude-lsp-cli install <language>");
  console.log("To install all servers: claude-lsp-cli install-all");
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
} else if (command === "install" && args[1]) {
  await installLanguageServer(args[1]);
} else if (command === "install-all") {
  await installAllLanguageServers();
} else if (command === "list-servers") {
  await listLanguageServers();
} else if (command === "help" || command === "--help" || command === "-h") {
  showHelp();
} else if (command === "--version" || command === "-v") {
  // Read version from package.json
  try {
    const packagePath = new URL("../package.json", import.meta.url).pathname;
    const packageJson = await Bun.file(packagePath).json();
    console.log(packageJson.version || "3.0.0");
  } catch (error) {
    console.log("3.0.0"); // Fallback version
  }
} else {
  console.error("Invalid command. Use 'claude-lsp-cli help' for usage information.");
  showHelp();
  process.exit(1);
}