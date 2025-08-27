#!/usr/bin/env bun

/**
 * Claude LSP CLI - Hook handler for Claude Code
 * 
 * Usage:
 *   claude-lsp-cli hook <event-type>  - Handle Claude Code hook events
 *   claude-lsp-cli diagnostics <project> - Query project-level diagnostics
 * 
 * This CLI acts as the entry point for Claude Code hooks and manages
 * the LSP server lifecycle and diagnostics.
 */

import { secureHash } from "./utils/security";
import { logger } from "./utils/logger";
import { resolve, join } from "path";
import { TIMEOUTS } from "./constants";


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
  
  
  // Add debug logging to /tmp
  const debugLog = `/tmp/claude-lsp-hook-debug.log`;
  const timestamp = new Date().toISOString();
  const existingContent = await Bun.file(debugLog).text().catch(() => '');
  await Bun.write(debugLog, existingContent + `\n[${timestamp}] Hook event triggered: ${eventType}\n`);
  const updatedContent = await Bun.file(debugLog).text();
  await Bun.write(debugLog, updatedContent + `[${timestamp}] Process CWD: ${process.cwd()}\n`);
  
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
  }, TIMEOUTS.DIAGNOSTIC_TIMEOUT_MS);
  
  try {
    // Import and run diagnostics logic directly
    const { handleHookEvent: handleDiagnostics } = await import("./diagnostics");
    
    // Run diagnostics with the event type
    // Note: handleDiagnostics will read stdin itself
    // Returns true if any summary was output (including "no warnings or errors")
    const hasSummary = await handleDiagnostics(eventType);
    
    // Clear timeout on success
    clearTimeout(timeoutId);
    
    // For PostToolUse with any summary output, exit 2 to show feedback
    // For other hooks or no summary, exit 0
    if (eventType === 'PostToolUse' && hasSummary) {
      const content1 = await Bun.file(debugLog).text().catch(() => '');
      await Bun.write(debugLog, content1 + `[${timestamp}] Exiting with feedback code (2) due to summary output\n`);
      process.exit(feedbackExitCode); // Exit 2 shows feedback in Claude
    } else {
      const content2 = await Bun.file(debugLog).text().catch(() => '');
      await Bun.write(debugLog, content2 + `[${timestamp}] Exiting with success code (0)\n`);
      process.exit(successExitCode);
    }
    
  } catch (error) {
    clearTimeout(timeoutId);
    const errorContent1 = await Bun.file(debugLog).text().catch(() => '');
    await Bun.write(debugLog, errorContent1 + `[${timestamp}] ERROR in hook handler: ${error}\n`);
    const errorContent2 = await Bun.file(debugLog).text().catch(() => '');
    await Bun.write(debugLog, errorContent2 + `[${timestamp}] Error stack: ${error instanceof Error ? error.stack : 'No stack'}\n`);
    await logger.error('Hook handler error', { eventType, error });
    
    // Format error as system message for Claude
    console.error(`[[system-message]]: ${JSON.stringify({
      status: "diagnostics_report",
      result: "hook_error",
      error: error instanceof Error ? error.message : "Unknown error",
      eventType,
      reference: { type: "hook_error", event: eventType }
    })}`);
    
    const errorContent3 = await Bun.file(debugLog).text().catch(() => '');
    await Bun.write(debugLog, errorContent3 + `[${timestamp}] Exiting with error code (1)\n`);
    process.exit(errorExitCode);
  }
}

async function queryDiagnostics(projectRoot: string) {
  try {
    // Use runDiagnostics from diagnostics.ts which has auto-start logic
    const { runDiagnostics } = await import("./diagnostics");
    
    // Run diagnostics for entire project (no file-specific diagnostics)
    const result = await runDiagnostics(projectRoot);
    
    // Only output if there's a meaningful summary to report
    if (result && result.summary) {
      console.log(JSON.stringify(result));
    }
    // If no summary, exit silently (code 0)
    
  } catch (error) {
    await logger.error('Failed to query diagnostics', error, { projectRoot });
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
  claude-lsp-cli diagnostics <project>       Query project-level diagnostics
  claude-lsp-cli status [project]            Show running LSP servers
  claude-lsp-cli start <project>             Start LSP server for project
  claude-lsp-cli stop <project>              Stop LSP server for project
  claude-lsp-cli kill-all                    Kill all running LSP servers
  claude-lsp-cli reset <project>             Reset LSP server cache (fast)
  claude-lsp-cli reset-dedup <project>       Reset deduplication only (faster)
  claude-lsp-cli install <language>          Install language server
  claude-lsp-cli install-all                 Install all supported language servers
  claude-lsp-cli list-servers                List available language servers
  claude-lsp-cli list-projects <directory>   Find all projects in directory
  claude-lsp-cli get-lsp-scope <project>     Get LSP scope for a project
  claude-lsp-cli help                        Show this help message

Hook Event Types:
  PreToolUse     - Before tool execution  
  PostToolUse    - After tool execution (main use case)
  
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

  # List all projects in current directory
  claude-lsp-cli list-projects .

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
    const { Database } = await import("bun:sqlite");
    const { existsSync } = await import("fs");
    
    // Get SQLite database path
    const claudeHome = process.env.CLAUDE_HOME || `${process.env.HOME || process.env.USERPROFILE}/.claude`;
    const dbPath = `${claudeHome}/data/claude-code-lsp.db`;
    
    // Create a map of project hashes to project paths from database
    const projectMap = new Map<string, string>();
    
    if (existsSync(dbPath)) {
      const db = new Database(dbPath, { readonly: true });
      try {
        // Query diagnostic reports table for project info including project_path
        const projects = db.prepare(`
          SELECT DISTINCT project_hash, project_path, MAX(last_report_time) as last_seen
          FROM diagnostic_reports
          GROUP BY project_hash
        `).all() as Array<{ project_hash: string; project_path: string | null; last_seen: number }>;
        
        // Build map of project hashes to paths
        for (const project of projects) {
          if (project.project_path) {
            projectMap.set(project.project_hash, project.project_path);
          } else {
            // Fallback: try to get a file path from diagnostic history to approximate project root
            const filePath = db.prepare(`
              SELECT file_path FROM diagnostic_history 
              WHERE project_hash = ? 
              LIMIT 1
            `).get(project.project_hash) as { file_path: string } | undefined;
            
            if (filePath) {
              projectMap.set(project.project_hash, `[from diagnostics]`);
            }
          }
        }
      } finally {
        db.close();
      }
    }
    
    const files = await readdir(socketDir).catch(() => []);
    const sockets = files.filter(f => f.startsWith('claude-lsp-') && f.endsWith('.sock'));
    
    if (sockets.length === 0) {
      console.log("No LSP servers running");
      return;
    }
    
    console.log("Running LSP servers:");
    console.log("─".repeat(80));
    
    for (const socket of sockets) {
      const hash = socket.replace('claude-lsp-', '').replace('.sock', '');
      
      // Try to get server health status
      let status = 'not responding';
      let uptime = 0;
      
      try {
        const response = await fetch('http://localhost/health', { 
          unix: `${socketDir}/${socket}`,
          signal: AbortSignal.timeout(1000) // 1 second timeout
        });
        if (response.ok) {
          const data = await response.json() as any;
          status = 'healthy';
          uptime = Math.floor(data.uptime || 0);
        } else {
          status = 'unhealthy';
        }
      } catch {
        // Server not responding
      }
      
      // Get project info from database if available
      const projectInfo = projectMap.has(hash) ? projectMap.get(hash) : 'unknown';
      
      console.log(`  Hash:     ${hash}`);
      console.log(`  Project:  ${projectInfo}`);
      console.log(`  Status:   ${status}${status === 'healthy' ? ` (uptime: ${uptime}s)` : ''}`);
      console.log(`  Socket:   ${socketDir}/${socket}`);
      console.log("─".repeat(80));
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
    const { readdir, unlink } = await import("fs/promises");
    const { DiagnosticDeduplicator } = await import("./utils/diagnostic-dedup");
    
    // Get all socket files
    const files = await readdir(socketDir).catch(() => []);
    const sockets = files.filter(f => f.startsWith('claude-lsp-') && f.endsWith('.sock'));
    
    let stopped = 0;
    let killed = 0;
    let cleaned = 0;
    let dbEntriesRemoved = 0;
    
    // Create deduplicator to access database (use dummy path)
    const dedup = new DiagnosticDeduplicator(process.cwd());
    
    try {
      // Get all registered language servers from database
      const registeredServers = dedup.getAllLanguageServers();
      const currentPid = process.pid;
      
      // First try graceful shutdown via sockets
      for (const socket of sockets) {
        try {
          const response = await fetch('http://localhost/shutdown', { 
            method: 'POST',
            unix: `${socketDir}/${socket}`,
            signal: AbortSignal.timeout(1000) // 1 second timeout
          });
          if (response.ok) {
            stopped++;
          }
        } catch (error) {
          // Server not responding, will force kill below
        }
        
        // Remove socket file
        try {
          await unlink(`${socketDir}/${socket}`);
          cleaned++;
        } catch (error) {
          // Socket already removed or permission denied
        }
      }
      
      // Force kill any remaining processes from database
      for (const server of registeredServers) {
        try {
          // Skip if it's our own process
          if (server.pid === currentPid) {
            continue;
          }
          
          // Check if process exists
          process.kill(server.pid, 0); // Check if alive
          
          // Try graceful termination first
          process.kill(server.pid, 'SIGTERM');
          
          // Give it a moment to terminate gracefully
          await new Promise(resolve => setTimeout(resolve, 100));
          
          // Check if still alive and force kill if needed
          try {
            process.kill(server.pid, 0); // Check again
            process.kill(server.pid, 'SIGKILL'); // Force kill
            killed++;
          } catch {
            // Process terminated gracefully
            stopped++;
          }
        } catch {
          // Process doesn't exist or already dead
        }
        
        // Remove from database regardless
        try {
          dedup.removeLanguageServer(server.project_hash, server.language);
          dbEntriesRemoved++;
        } catch (error) {
          // Failed to remove from database
        }
      }
    } finally {
      // Always close database connection
      try {
        dedup.close();
      } catch {
        // Ignore close errors
      }
    }
    
    // Report results
    if (stopped > 0 || killed > 0 || cleaned > 0 || dbEntriesRemoved > 0) {
      console.log(`Stopped ${stopped} servers gracefully, force-killed ${killed}`);
      console.log(`Cleaned ${cleaned} sockets, removed ${dbEntriesRemoved} database entries`);
    } else {
      console.log("No LSP servers were running");
    }
    
    // Exit cleanly
    process.exit(0);
  } catch (error) {
    console.error("Failed to stop servers:", error);
    process.exit(1);
  }
}

async function resetServer(projectRoot: string) {
  const { secureHash } = await import("./utils/security");
  const projectHash = secureHash(projectRoot).substring(0, 16);
  
  // Use the same socket path as the server
  const socketPath = `/tmp/claude-lsp-${projectHash}.sock`;

  try {
    console.log(`Resetting LSP server for project: ${projectRoot}`);
    console.log(`Using socket: ${socketPath}`);
    
    const response = await fetch('http://localhost/reset', { 
      method: 'POST',
      unix: socketPath,
      signal: AbortSignal.timeout(TIMEOUTS.SERVER_REQUEST_TIMEOUT_MS) // 10 second timeout
    });
    
    if (response.ok) {
      const data = await response.json() as any;
      console.log(`✅ Reset completed: ${data.documentsReset} documents refreshed`);
    } else {
      const errorText = await response.text();
      console.error(`❌ Reset failed: ${response.status} - ${errorText}`);
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.error("❌ Reset timed out - server may be unresponsive");
    } else {
      console.error("❌ Reset failed:", error instanceof Error ? error.message : String(error));
      console.log("💡 Try 'claude-lsp-cli kill-all' if the server is stuck");
    }
  }
}

async function resetDedup(projectRoot: string) {
  const { secureHash } = await import("./utils/security");
  const projectHash = secureHash(projectRoot).substring(0, 16);
  
  // Use the same socket path as the server
  const socketPath = `/tmp/claude-lsp-${projectHash}.sock`;

  try {
    console.log(`Resetting deduplication for project: ${projectRoot}`);
    console.log(`Using socket: ${socketPath}`);
    
    const response = await fetch('http://localhost/reset-dedup', { 
      method: 'POST',
      unix: socketPath,
      signal: AbortSignal.timeout(TIMEOUTS.RESET_TIMEOUT_MS) // 5 second timeout - faster than full reset
    });
    
    if (response.ok) {
      const data = await response.json() as any;
      console.log(`✅ Deduplication reset completed: ${data.message}`);
    } else {
      const errorText = await response.text();
      console.error(`❌ Deduplication reset failed: ${response.status} - ${errorText}`);
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.error("❌ Deduplication reset timed out - server may be unresponsive");
    } else {
      console.error("❌ Deduplication reset failed:", error instanceof Error ? error.message : String(error));
    }
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

async function listProjects(baseDir: string) {
  // Import findAllProjects from diagnostics
  const { findAllProjects } = await import("./diagnostics");
  
  const absolutePath = resolve(baseDir);
  const projects = await findAllProjects(absolutePath);
  
  // Output as JSON array for the test to consume
  console.log(JSON.stringify(projects, null, 2));
}

async function getLspScope(projectPath: string) {
  // Return the LSP scope configuration for a given project
  const absolutePath = resolve(projectPath);
  
  // For nested projects, the LSP scope should be isolated to that project only
  const scope = {
    root: absolutePath,
    exclusions: [] as string[]
  };
  
  // Find nested projects within this project to exclude them
  const { findAllProjects } = await import("./diagnostics");
  const nestedProjects = await findAllProjects(absolutePath);
  
  // Exclude any nested projects found (they should have their own LSP scope)
  for (const nested of nestedProjects) {
    if (nested !== absolutePath && nested.startsWith(absolutePath)) {
      // This is a nested project, exclude it from parent's scope
      const relativePath = nested.replace(absolutePath + '/', '');
      scope.exclusions.push(relativePath);
    }
  }
  
  // Output as JSON for the test to consume
  console.log(JSON.stringify(scope, null, 2));
}

// Main execution
if (command === "hook" && eventType) {
  await handleHookEvent(eventType);
} else if (command === "diagnostics" && args[1]) {
  const projectRoot = resolve(args[1]);
  await queryDiagnostics(projectRoot);
} else if (command === "status") {
  const projectRoot = args[1] ? resolve(args[1]) : undefined;
  await showStatus(projectRoot);
} else if (command === "start" && args[1]) {
  await startServer(args[1]);
} else if (command === "stop" && args[1]) {
  await stopServer(args[1]);
} else if (command === "kill-all") {
  await killAllServers();
} else if (command === "reset" && args[1]) {
  await resetServer(args[1]);
} else if (command === "reset-dedup" && args[1]) {
  await resetDedup(args[1]);
} else if (command === "install" && args[1]) {
  await installLanguageServer(args[1]);
} else if (command === "install-all") {
  await installAllLanguageServers();
} else if (command === "list-servers") {
  await listLanguageServers();
} else if (command === "list-projects" && args[1]) {
  await listProjects(args[1]);
} else if (command === "get-lsp-scope" && args[1]) {
  await getLspScope(args[1]);
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
} else if (!command) {
  // No command provided - just show help
  showHelp();
} else {
  console.error(`Invalid command: ${command}. Use 'claude-lsp-cli help' for usage information.`);
  showHelp();
  process.exit(1);
}