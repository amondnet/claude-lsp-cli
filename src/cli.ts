#!/usr/bin/env bun

/**
 * Claude LSP CLI - Hook handler for Claude Code
 * 
 * Usage:
 *   claude-lsp-cli hook <event-type>  - Handle Claude Code hook events
 *   claude-lsp-cli diagnostics <project> [file] - Query diagnostics
 * 
 * This CLI acts as the entry point for Claude Code hooks and manages
 * the LSP server lifecycle and diagnostics.
 */

import { secureHash } from "./utils/security";
import { logger } from "./utils/logger";
import { resolve, join, dirname } from "path";
import { TIMEOUTS } from "./constants";
import { ServerRegistry } from "./utils/server-registry";
import * as serverManager from "./cli-server-manager";
import * as diagnosticsClient from "./cli-diagnostics";
import * as lspInstaller from "./cli-lsp-installer";
import { languageServers, isLanguageServerInstalled, getInstallInstructions } from "./language-servers";

// Helper function to find the nearest project root for a file (delegates to diagnostics client)
async function findNearestProjectRoot(filePath: string): Promise<string> {
  return await diagnosticsClient.findProjectRoot(filePath);
}

// Helper function to ensure server is running and return socket path (delegates to server manager)
async function ensureServerRunning(projectRoot: string): Promise<string> {
  return await serverManager.ensureServerRunning(projectRoot);
}

// Hook handler for Claude Code integration (delegates to cli-hooks.ts)
async function handleHookEventDirect(eventType: string): Promise<boolean> {
  const { handleHookEvent } = await import('./cli-hooks');
  return await handleHookEvent(eventType);
}

// Project discovery function (delegates to diagnostics client)
async function findAllProjects(baseDir: string): Promise<string[]> {
  return await diagnosticsClient.findAllProjects(baseDir);
}


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
    console.error(`Hook timed out after 30 seconds for event: ${eventType}`);
    process.exit(errorExitCode);
  }, TIMEOUTS.DIAGNOSTIC_TIMEOUT_MS);
  
  try {
    // Handle hook event directly
    const hasSummary = await handleHookEventDirect(eventType);
    
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
    console.error(`Hook error: ${error instanceof Error ? error.message : "Unknown error"}`);
    
    const errorContent3 = await Bun.file(debugLog).text().catch(() => '');
    await Bun.write(debugLog, errorContent3 + `[${timestamp}] Exiting with error code (1)\n`);
    process.exit(errorExitCode);
  }
}

async function queryDiagnostics(projectRoot: string, filePath?: string) {
  try {
    // If no file specified, check if this directory contains multiple projects
    if (!filePath) {
      const allProjects = await findAllProjects(projectRoot);
      
      // If multiple projects found, aggregate diagnostics from all
      if (allProjects.length > 1) {
        return await queryMultiProjectDiagnostics(allProjects);
      }
    }
    
    // If file is specified, check if it belongs to a different project
    if (filePath) {
      const { relative, resolve } = await import('path');
      const absoluteFilePath = resolve(filePath);
      
      // Find the actual project root for this file
      const fileProjectRoot = await findNearestProjectRoot(absoluteFilePath);
      
      // If file's project is different from specified project, use file's project
      const absoluteProjectRoot = resolve(projectRoot);
      if (fileProjectRoot !== absoluteProjectRoot) {
        projectRoot = fileProjectRoot;
      }
      
      // Convert to relative path for the server
      const relativeFilePath = relative(projectRoot, absoluteFilePath);
      const fileParam = `?file=${encodeURIComponent(relativeFilePath)}`;
      
      // Query with the correct project and file
      const socketPath = await ensureServerRunning(projectRoot);
      const response = await fetch(`http://localhost/diagnostics${fileParam}`, {
        // @ts-ignore - Bun supports unix option
        unix: socketPath,
        signal: AbortSignal.timeout(30000)
      });
      
      if (response.ok) {
        const result = await response.text();
        if (result) {
          console.log(result);
        }
      } else {
        console.log('[[system-message]]:{"diagnostics":[],"summary":"no warnings or errors"}');
      }
    } else {
      // No file specified - query project-wide diagnostics
      const socketPath = await ensureServerRunning(projectRoot);
      const response = await fetch(`http://localhost/diagnostics`, {
        // @ts-ignore - Bun supports unix option
        unix: socketPath,
        signal: AbortSignal.timeout(30000)
      });
      
      if (response.ok) {
        const result = await response.text();
        if (result) {
          console.log(result);
        }
      } else {
        console.log('[[system-message]]:{"diagnostics":[],"summary":"no warnings or errors"}');
      }
    }
    
    process.exit(0); // Diagnostics command always exits 0
    
  } catch (error) {
    // Skip logger to avoid potential serialization issues
    console.error(`DIAGNOSTICS_QUERY_ERROR: ${error instanceof Error ? error.message : "Unknown error"}`);
    if (error instanceof Error && error.stack) {
      console.error("Stack trace:", error.stack);
    }
    console.error("Hint: Is the LSP server running? Try starting it first.");
    process.exit(1);
  }
}

async function queryMultiProjectDiagnostics(projects: string[]) {
  const allDiagnostics: any[] = [];
  let totalErrors = 0;
  let totalWarnings = 0;
  const languageStats: Record<string, { errors: number; warnings: number }> = {};
  
  // Query diagnostics from each project
  for (const project of projects) {
    try {
      const socketPath = await ensureServerRunning(project);
      const response = await fetch(`http://localhost/diagnostics`, {
        // @ts-ignore - Bun supports unix option
        unix: socketPath,
        signal: AbortSignal.timeout(10000) // Shorter timeout per project
      });
      
      if (response.ok) {
        const result = await response.text();
        if (result && result.includes('[[system-message]]:')) {
          const jsonPart = result.replace('[[system-message]]:', '');
          try {
            const data = JSON.parse(jsonPart);
            if (data.diagnostics && data.diagnostics.length > 0) {
              // Add project context to each diagnostic
              const projectName = project.split('/').pop() || project;
              for (const diag of data.diagnostics) {
                allDiagnostics.push({
                  ...diag,
                  project: projectName
                });
                
                // Track language-specific stats
                const language = diag.source || 'unknown';
                if (!languageStats[language]) {
                  languageStats[language] = { errors: 0, warnings: 0 };
                }
                
                if (diag.severity === 'error') {
                  totalErrors++;
                  languageStats[language].errors++;
                } else if (diag.severity === 'warning') {
                  totalWarnings++;
                  languageStats[language].warnings++;
                }
              }
            }
          } catch (e) {
            // Skip malformed responses
          }
        }
      }
    } catch (error) {
      // Skip projects that fail to query
      continue;
    }
  }
  
  // Sort all diagnostics by severity, then by project, then by line
  allDiagnostics.sort((a, b) => {
    if (a.severity === 'error' && b.severity === 'warning') return -1;
    if (a.severity === 'warning' && b.severity === 'error') return 1;
    if (a.project !== b.project) return a.project.localeCompare(b.project);
    return a.line - b.line;
  });
  
  // Limit to 5 total items
  const displayDiagnostics = allDiagnostics.slice(0, 5);
  
  // Generate summary with per-language breakdown
  let summary: string;
  if (totalErrors === 0 && totalWarnings === 0) {
    summary = "no warnings or errors";
  } else {
    // Build total summary
    const totalParts: string[] = [];
    if (totalErrors > 0) totalParts.push(`${totalErrors} error(s)`);
    if (totalWarnings > 0) totalParts.push(`${totalWarnings} warning(s)`);
    
    // Build per-language breakdown if more than one language
    const languages = Object.keys(languageStats);
    if (languages.length > 1) {
      const languageBreakdown = languages.map(lang => {
        const stats = languageStats[lang];
        const parts: string[] = [];
        if (stats.errors > 0) parts.push(`${stats.errors} error(s)`);
        if (stats.warnings > 0) parts.push(`${stats.warnings} warning(s)`);
        return `${lang}: ${parts.join(', ')}`;
      }).join(', ');
      
      summary = `${totalParts.join(', ')} (${languageBreakdown})`;
    } else {
      summary = totalParts.join(', ');
    }
  }
  
  const result: any = { summary };
  if (displayDiagnostics.length > 0) {
    result.diagnostics = displayDiagnostics;
  }
  
  console.log(`[[system-message]]:${JSON.stringify(result)}`);
  process.exit(0);
}

async function showHelp() {
  console.log(`Claude LSP CLI - Real-time diagnostics for Claude Code\n`);
  
  // Check language support in parallel
  console.log("Language Support Status:");
  console.log("─".repeat(70));
  
  const languages = [
    { name: "TypeScript", cmd: "tsc", install: "npm install -g typescript" },
    { name: "Python", cmd: "pyright", install: "pip install pyright" },
    { name: "Go", cmd: "go", install: "https://go.dev/dl/" },
    { name: "Rust", cmd: "rustc", install: "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh" },
    { name: "Java", cmd: "javac", install: "https://adoptium.net/" },
    { name: "C/C++", cmd: "gcc", install: "Install GCC or Clang" },
    { name: "PHP", cmd: "php", install: "https://www.php.net/downloads" },
    { name: "Swift", cmd: "swiftc", install: "Install Xcode (macOS)" },
  ];
  
  // Check all languages in parallel
  const checkPromises = languages.map(async (lang) => {
    try {
      // Check in PATH and common locations
      const proc = Bun.spawn(["which", lang.cmd], { 
        stdio: ["ignore", "pipe", "ignore"],
        env: { 
          ...process.env, 
          PATH: `${process.env.HOME}/.bun/bin:${process.env.HOME}/.local/bin:${process.env.PATH}` 
        }
      });
      await proc.exited;
      return { ...lang, installed: proc.exitCode === 0 };
    } catch {
      return { ...lang, installed: false };
    }
  });
  
  const results = await Promise.all(checkPromises);
  
  // Display results
  for (const lang of results) {
    const status = lang.installed ? "✅" : "❌";
    const name = lang.name.padEnd(12);
    console.log(`  ${status} ${name} ${lang.cmd.padEnd(10)}`);
    if (!lang.installed) {
      console.log(`     → Install: ${lang.install}`);
    }
  }
  
  console.log(`
Commands:
  list-servers              Check which language servers are installed
  install <language>        Get install instructions for a language
  status                    Show running LSP servers
  start <project>           Start LSP server for project  
  stop-all                  Stop all LSP servers
  diagnostics <project>     Query project diagnostics
  help                      Show this help message

Setup Hook (for automatic diagnostics):
  Add to ~/.claude/settings.json:
  { "hooks": { "PostToolUse": [{ 
    "hooks": [{ "type": "command", 
      "command": "claude-lsp-cli hook PostToolUse" }] }] } }

Environment Variables:
  CLAUDE_LSP_GLOBAL_MODE=true    Use one global server (optional)`);
}

async function showAllCommands() {
  console.log(`
All Commands:

Server Management:
  status [project]          Show running LSP servers
  start <project>           Start LSP server for project
  stop <project>            Stop LSP server for project
  stop-all                  Stop all running LSP servers
  stop-idle [minutes]       Stop servers idle > N minutes

Diagnostics:
  diagnostics <project>     Query project-wide diagnostics
  reset <project>           Reset LSP server cache
  reset-dedup <project>     Reset deduplication only

Language Servers:
  list-servers              Show language server status
  install <language>        Show install instructions
  install-all               Show all install instructions

Discovery:
  list-projects <dir>       Find all projects in directory
  get-lsp-scope <project>   Get LSP scope for a project

Hook Integration:
  hook <event-type>         Handle Claude Code hook events

Environment Variables:
  CLAUDE_LSP_GLOBAL_MODE    Use one global server (default: true)
  CLAUDE_LSP_MAX_SERVERS    Max concurrent servers (default: 3)
  LOG_LEVEL                 Set logging level (ERROR, WARN, INFO, DEBUG)
`);
}

async function showLanguageServers() {
  console.log("\nLanguage Servers Status:");
  console.log("------------------------");
  try {
    const entries = Object.entries(languageServers).sort((a, b) => a[1].name.localeCompare(b[1].name));
    
    // Check all language servers in parallel for speed
    const checkPromises = entries.map(async ([lang, cfg]) => ({
      lang,
      cfg,
      installed: await Promise.resolve(isLanguageServerInstalled(lang))
    }));
    
    const results = await Promise.all(checkPromises);
    
    // Display results in the original sorted order
    for (const { lang, cfg, installed } of results) {
      console.log(`${installed ? '✅' : '❌'} ${cfg.name} (${lang})`);
      if (!installed) {
        const instructions = getInstallInstructions(lang).trim();
        if (instructions) {
          console.log("  How to enable:");
          for (const line of instructions.split('\n')) {
            if (line.trim()) console.log(`    ${line}`);
          }
        }
      }
    }
  } catch (e) {
    // Non-fatal; help should still print
  }
}

async function showStatus(projectRoot?: string) {
  try {
    const registry = ServerRegistry.getInstance();
    
    // Clean up any dead servers first
    const cleanedCount = await registry.cleanupDeadServers();
    if (cleanedCount > 0) {
      console.log(`Cleaned up ${cleanedCount} dead server(s)\n`);
    }
    
    // Get all active servers or specific server
    let servers = registry.getAllActiveServers();
    
    if (projectRoot) {
      const absolutePath = resolve(projectRoot);
      const server = registry.getServerByPath(absolutePath);
      if (server) {
        servers = [server];
      } else {
        console.log(`No LSP server running for project: ${absolutePath}`);
        return;
      }
    }
    
    if (servers.length === 0) {
      console.log("No LSP servers running");
      return;
    }
    
    console.log("Running LSP servers:");
    console.log("─".repeat(80));
    
    for (const server of servers) {
      // Calculate uptime
      const startTime = new Date(server.start_time);
      const now = new Date();
      const uptime = Math.floor((now.getTime() - startTime.getTime()) / 1000);
      
      // Check if server is responsive via socket
      let actualStatus = server.status;
      try {
        const response = await fetch('http://localhost/health', { 
          unix: server.socket_path,
          signal: AbortSignal.timeout(1000) // 1 second timeout
        });
        if (response.ok) {
          actualStatus = 'healthy';
          // Update registry if status changed
          if (server.status !== 'healthy') {
            registry.updateServerStatus(server.project_hash, 'healthy');
          }
        } else {
          actualStatus = 'unhealthy';
          registry.updateServerStatus(server.project_hash, 'unhealthy');
        }
      } catch {
        actualStatus = 'not responding';
        registry.updateServerStatus(server.project_hash, 'unhealthy');
      }
      
      console.log(`  Hash:     ${server.project_hash}`);
      console.log(`  Project:  ${server.project_root}`);
      console.log(`  Languages:${server.languages.join(', ')}`);
      console.log(`  PID:      ${server.pid}`);
      console.log(`  Status:   ${actualStatus}${actualStatus === 'healthy' ? ` (uptime: ${uptime}s)` : ''}`);
      console.log(`  Socket:   ${server.socket_path}`);
      console.log("─".repeat(80));
    }
    
    // Show statistics
    const stats = registry.getStatistics();
    console.log(`\nTotal: ${stats.activeServers} server(s)`);
    if (Object.keys(stats.languages).length > 0) {
      console.log('Languages:', Object.entries(stats.languages).map(([lang, count]) => `${lang} (${count})`).join(', '));
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
  
  // Find server binary using same logic as ensureServerRunning
  const { existsSync } = await import('fs');
  const possiblePaths = [
    join(process.env.HOME || '', '.local', 'bin', 'claude-lsp-server'), // Installed location
    join(import.meta.dir, '..', 'bin', 'claude-lsp-server'),
    join(process.env.HOME || '', '.claude', 'claude-code-lsp', 'bin', 'claude-lsp-server'),
    '/Users/steven_chong/Downloads/repos/claude-code-lsp/bin/claude-lsp-server',
  ];
  
  let serverPath: string | null = null;
  for (const path of possiblePaths) {
    if (existsSync(path)) {
      serverPath = path;
      break;
    }
  }
  
  if (!serverPath) {
    throw new Error('claude-lsp-server binary not found');
  }
  
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
  const registry = ServerRegistry.getInstance();
  
  try {
    // Get server info from registry
    const server = registry.getServerByPath(absolutePath);
    
    if (!server) {
      console.log(`No LSP server running for project: ${absolutePath}`);
      return;
    }
    
    console.log(`Stopping LSP server for project: ${absolutePath}`);
    console.log(`  PID: ${server.pid}, Languages: ${server.languages.join(', ')}`);
    
    // Try graceful shutdown via socket first
    let gracefulShutdown = false;
    try {
      const response = await fetch('http://localhost/shutdown', { 
        method: 'POST',
        unix: server.socket_path,
        signal: AbortSignal.timeout(3000) // 3 second timeout
      });
      
      if (response.ok) {
        gracefulShutdown = true;
        console.log("✅ Server shutdown gracefully");
      }
    } catch (error) {
      console.log("⚠️  Server not responding to shutdown request, will force stop");
    }
    
    // If graceful shutdown failed, force kill
    if (!gracefulShutdown) {
      try {
        // Check if process still exists
        process.kill(server.pid, 0);
        
        // Try SIGTERM first
        process.kill(server.pid, 'SIGTERM');
        console.log("📡 Sent SIGTERM signal");
        
        // Wait a moment for graceful termination
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Check if still alive and force kill if needed
        try {
          process.kill(server.pid, 0);
          process.kill(server.pid, 'SIGKILL');
          console.log("💥 Force killed with SIGKILL");
        } catch {
          console.log("✅ Process terminated");
        }
      } catch (error) {
        console.log("✅ Process not found (already stopped)");
      }
    }
    
    // Mark as stopped in registry
    registry.markServerStopped(server.project_hash);
    
    // Clean up socket file
    try {
      const fs = await import("fs");
      if (fs.existsSync(server.socket_path)) {
        fs.unlinkSync(server.socket_path);
        console.log("🧹 Cleaned up socket file");
      }
    } catch (error) {
      console.log("⚠️  Could not clean up socket file");
    }
    
  } catch (error) {
    console.error("Failed to stop server:", error);
  }
}

async function stopIdleServers(idleMinutes: number = 30) {
  const registry = ServerRegistry.getInstance();
  
  try {
    // First clean up any dead servers
    await registry.cleanupDeadServers();
    
    // Get all servers
    const servers = registry.getAllActiveServers();
    
    if (servers.length === 0) {
      console.log("No running LSP servers found");
      return;
    }
    
    let stoppedCount = 0;
    const now = Date.now();
    const idleThreshold = idleMinutes * 60 * 1000; // Convert to milliseconds
    
    console.log(`🔍 Checking for servers idle for > ${idleMinutes} minutes...`);
    
    for (const server of servers) {
      const lastResponse = new Date(server.last_response).getTime();
      const idleTime = now - lastResponse;
      const idleMinutesActual = Math.floor(idleTime / 60000);
      
      if (idleTime > idleThreshold) {
        console.log(`\n🎯 Stopping idle server: ${server.project_root}`);
        console.log(`   Idle for: ${idleMinutesActual} minutes`);
        console.log(`   PID: ${server.pid}`);
        
        try {
          // Try graceful shutdown first
          try {
            const response = await fetch('http://localhost/shutdown', { 
              method: 'POST',
              unix: server.socket_path,
              signal: AbortSignal.timeout(2000)
            });
            
            if (response.ok) {
              console.log("   ✅ Shutdown gracefully");
            }
          } catch {
            // Force kill if graceful shutdown failed
            try {
              process.kill(server.pid, 'SIGKILL');
              console.log("   💥 Force killed");
            } catch {
              console.log("   👻 Process already dead");
            }
          }
          
          // Mark as stopped in registry
          registry.markServerStopped(server.project_hash);
          
          // Clean up socket file
          try {
            const fs = await import("fs");
            if (fs.existsSync(server.socket_path)) {
              fs.unlinkSync(server.socket_path);
              console.log("   🧹 Socket cleaned");
            }
          } catch {
            console.log("   ⚠️  Could not clean socket");
          }
          
          stoppedCount++;
        } catch (error) {
          console.error(`   ❌ Failed to stop: ${error}`);
        }
      } else {
        console.log(`✅ Active: ${server.project_root} (idle ${idleMinutesActual} min)`);
      }
    }
    
    if (stoppedCount > 0) {
      console.log(`\n📊 Stopped ${stoppedCount} idle server(s)`);
    } else {
      console.log(`\n✅ No servers exceeded idle threshold of ${idleMinutes} minutes`);
    }
    
  } catch (error) {
    console.error("❌ Failed to stop idle servers:", error);
    throw error;
  }
}

async function stopAllServers() {
  const registry = ServerRegistry.getInstance();
  
  try {
    console.log("🛑 Stopping all LSP servers...");
    
    // Get all active servers from registry
    const servers = registry.getAllActiveServers();
    
    if (servers.length === 0) {
      console.log("No LSP servers are running");
      return;
    }
    
    console.log(`Found ${servers.length} active server(s)`);
    
    let gracefullyStopped = 0;
    let forceKilled = 0;
    let cleaned = 0;
    let alreadyDead = 0;
    
    const currentPid = process.pid;
    
    // Process each server
    for (const server of servers) {
      // Skip our own process
      if (server.pid === currentPid) {
        console.log(`⏭️  Skipping self (PID ${server.pid})`);
        continue;
      }
      
      console.log(`\n🎯 Stopping server: ${server.project_root}`);
      console.log(`   PID: ${server.pid}, Languages: ${server.languages.join(', ')}`);
      
      // Try graceful shutdown first
      let gracefulShutdown = false;
      try {
        const response = await fetch('http://localhost/shutdown', { 
          method: 'POST',
          unix: server.socket_path,
          signal: AbortSignal.timeout(2000) // 2 second timeout
        });
        
        if (response.ok) {
          gracefulShutdown = true;
          gracefullyStopped++;
          console.log("   ✅ Shutdown gracefully");
        }
      } catch (error) {
        console.log("   ⚠️  Not responding to shutdown request");
      }
      
      // Force kill if graceful shutdown failed
      if (!gracefulShutdown) {
        try {
          // Check if process still exists
          process.kill(server.pid, 0);
          
          // Try SIGTERM first
          process.kill(server.pid, 'SIGTERM');
          console.log("   📡 Sent SIGTERM");
          
          // Wait a moment
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // Check if still alive and force kill
          try {
            process.kill(server.pid, 0);
            process.kill(server.pid, 'SIGKILL');
            forceKilled++;
            console.log("   💥 Force killed (SIGKILL)");
          } catch {
            gracefullyStopped++;
            console.log("   ✅ Terminated gracefully");
          }
        } catch (error) {
          alreadyDead++;
          console.log("   👻 Process not found (already stopped)");
        }
      }
      
      // Mark as stopped in registry
      registry.markServerStopped(server.project_hash);
      
      // Clean up socket file
      try {
        const fs = await import("fs");
        if (fs.existsSync(server.socket_path)) {
          fs.unlinkSync(server.socket_path);
          cleaned++;
          console.log("   🧹 Socket cleaned");
        }
      } catch (error) {
        console.log("   ⚠️  Could not clean socket");
      }
    }
    
    // Final cleanup of any remaining dead servers
    const deadCount = await registry.cleanupDeadServers();
    
    // Report summary
    console.log(`\n📊 Summary:`);
    console.log(`   Gracefully stopped: ${gracefullyStopped}`);
    console.log(`   Force killed: ${forceKilled}`);
    console.log(`   Already dead: ${alreadyDead}`);
    console.log(`   Sockets cleaned: ${cleaned}`);
    if (deadCount > 0) {
      console.log(`   Registry cleaned: ${deadCount}`);
    }
    
    console.log("✅ All servers stopped");
    
  } catch (error) {
    console.error("❌ Failed to stop servers:", error);
    throw error;
  }
}

async function resetServer(projectRoot: string) {
  const { secureHash } = await import("./utils/security");
  const projectHash = secureHash(projectRoot).substring(0, 16);
  
  // Use the same socket path as the server
  const socketDir = process.env.XDG_RUNTIME_DIR || 
                   (process.platform === 'darwin' 
                     ? `${process.env.HOME}/Library/Application Support/claude-lsp/run`
                     : `${process.env.HOME}/.claude-lsp/run`);
  const socketPath = `${socketDir}/claude-lsp-${projectHash}.sock`;

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
      console.log("💡 Try 'claude-lsp-cli stop-all' if the server is stuck");
    }
  }
}

async function resetDedup(projectRoot: string) {
  const { secureHash } = await import("./utils/security");
  const projectHash = secureHash(projectRoot).substring(0, 16);
  
  // Use the same socket path as the server
  const socketDir = process.env.XDG_RUNTIME_DIR || 
                   (process.platform === 'darwin' 
                     ? `${process.env.HOME}/Library/Application Support/claude-lsp/run`
                     : `${process.env.HOME}/.claude-lsp/run`);
  const socketPath = `${socketDir}/claude-lsp-${projectHash}.sock`;

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
  // Use local findAllProjects function
  
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
  const { existsSync, statSync } = await import('fs');
  const arg1 = resolve(args[1]);
  
  let projectRoot: string;
  let filePath: string | undefined;
  
  // Simple check: is it a directory or file?
  if (existsSync(arg1) && statSync(arg1).isDirectory()) {
    // It's a directory - use as project root
    projectRoot = arg1;
    filePath = args[2] ? resolve(args[2]) : undefined;
  } else {
    // It's a file (or doesn't exist) - find project root and use as file
    projectRoot = await findNearestProjectRoot(arg1);
    filePath = arg1;
  }
  
  await queryDiagnostics(projectRoot, filePath);
} else if (command === "status") {
  const projectRoot = args[1] ? resolve(args[1]) : undefined;
  await showStatus(projectRoot);
} else if (command === "start" && args[1]) {
  await startServer(args[1]);
} else if (command === "stop" && args[1]) {
  await stopServer(args[1]);
} else if (command === "stop-all" || command === "kill-all") {
  await stopAllServers();
} else if (command === "stop-idle") {
  const minutes = args[1] ? parseInt(args[1]) : 30;
  if (isNaN(minutes) || minutes <= 0) {
    console.error("Invalid idle time. Please specify a positive number of minutes.");
    process.exit(1);
  }
  await stopIdleServers(minutes);
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
} else if (command === "limit-servers") {
  // Enforce server limit
  const { ServerRegistry } = await import('./utils/server-registry');
  const registry = ServerRegistry.getInstance();
  const killed = await registry.enforceServerLimit(8);
  console.log(`Server limit enforcement: killed ${killed} servers`);
  
  const stats = registry.getStatistics();
  console.log(`Active servers: ${stats.activeServers}`);
} else if (command === "get-lsp-scope" && args[1]) {
  await getLspScope(args[1]);
} else if (command === "help" || command === "--help" || command === "-h") {
  await showHelp();
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
  await showHelp();
} else {
  console.error(`Invalid command: ${command}. Use 'claude-lsp-cli help' for usage information.`);
  await showHelp();
  process.exit(1);
}
