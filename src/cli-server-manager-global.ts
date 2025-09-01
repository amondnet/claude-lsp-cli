/**
 * CLI Server Manager - GLOBAL VERSION
 * 
 * Manages a single global claude-lsp-server instance that handles all projects.
 * This is simpler and more efficient than per-project servers.
 */

import { spawn } from "child_process";
import { existsSync } from "fs";
import { join } from "path";
import { ServerRegistry } from "./utils/server-registry";
import { logger } from "./utils/logger";

/**
 * Get the global socket path
 */
function getGlobalSocketPath(): string {
  const socketDir = process.env.XDG_RUNTIME_DIR || 
                   (process.platform === 'darwin' 
                     ? `${process.env.HOME}/Library/Application Support/claude-lsp/run`
                     : `${process.env.HOME}/.claude-lsp/run`);
  return `${socketDir}/claude-lsp-global.sock`;
}

/**
 * Check if the global server is running
 */
export async function isServerRunning(): Promise<boolean> {
  const socketPath = getGlobalSocketPath();
  
  try {
    const response = await fetch('http://localhost/health', {
      // @ts-ignore - Bun supports unix option
      unix: socketPath,
      signal: AbortSignal.timeout(2000)
    });
    
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Ensure the global server is running
 */
export async function ensureServerRunning(): Promise<string> {
  const socketPath = getGlobalSocketPath();
  const registry = ServerRegistry.getInstance();
  
  // Check registry for global server
  const existingServer = registry.getServerByPath("GLOBAL");
  
  if (existingServer) {
    // Ping to verify it's actually running
    const running = await isServerRunning();
    
    if (running) {
      // Update heartbeat
      registry.updateHeartbeat("global");
      return socketPath;
    }
    
    // Server in registry but not responding - clean up
    registry.markServerStopped("global");
  }
  
  // Start new global server
  const serverPath = findServerBinary();
  if (!serverPath) {
    throw new Error('claude-lsp-server binary not found');
  }
  
  // Start with "GLOBAL" as the project root to indicate it handles all projects
  const child = spawn(serverPath, ["GLOBAL"], {
    stdio: 'ignore',
    detached: true,
    env: {
      ...process.env,
      CLAUDE_LSP_GLOBAL_MODE: "true"  // Tell server to run in global mode
    }
  });
  
  child.unref();
  
  // Register in SQLite
  registry.registerServer("GLOBAL", [], child.pid!, socketPath);
  
  // Wait for server to be ready
  const maxWait = 30000; // 30 seconds
  const startWait = Date.now();
  
  while (Date.now() - startWait < maxWait) {
    if (await isServerRunning()) {
      return socketPath;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  // Timeout - clean up
  registry.markServerStopped("global");
  throw new Error('Server startup timeout');
}

/**
 * Find the server binary
 */
function findServerBinary(): string | null {
  const possiblePaths = [
    join(import.meta.dir, '..', 'bin', 'claude-lsp-server'),
    join(process.env.HOME || '', '.claude', 'claude-code-lsp', 'bin', 'claude-lsp-server'),
    '/Users/steven_chong/Downloads/repos/claude-code-lsp/bin/claude-lsp-server',
  ];
  
  for (const path of possiblePaths) {
    if (existsSync(path)) {
      return path;
    }
  }
  
  return null;
}

/**
 * Start the global server
 */
export async function startServer(): Promise<void> {
  // Check if already running
  if (await isServerRunning()) {
    console.log(`✅ Global LSP server already running`);
    return;
  }
  
  console.log(`Starting global LSP server...`);
  
  try {
    const socketPath = await ensureServerRunning();
    console.log(`✅ Global server started successfully`);
    console.log(`   Socket: ${socketPath}`);
  } catch (error) {
    console.error(`❌ Failed to start server: ${error}`);
    throw error;
  }
}

/**
 * Stop the global server
 */
export async function stopServer(): Promise<void> {
  const registry = ServerRegistry.getInstance();
  
  const server = registry.getServerByPath("GLOBAL");
  if (!server) {
    console.log(`No global server running`);
    return;
  }
  
  console.log(`Stopping global server...`);
  console.log(`   PID: ${server.pid}`);
  
  // Try graceful shutdown first
  try {
    const response = await fetch('http://localhost/shutdown', {
      method: 'POST',
      // @ts-ignore - Bun supports unix option
      unix: server.socket_path,
      signal: AbortSignal.timeout(3000)
    });
    
    if (response.ok) {
      console.log("✅ Server shutdown gracefully");
      registry.markServerStopped("global");
      return;
    }
  } catch {
    // Graceful shutdown failed
  }
  
  // Force kill
  try {
    process.kill(server.pid, 'SIGKILL');
    console.log("✅ Server forcefully terminated");
  } catch (error) {
    console.log("⚠️ Server process may have already exited");
  }
  
  registry.markServerStopped("global");
}

/**
 * Stop all running servers (for compatibility)
 */
export async function stopAllServers(): Promise<void> {
  await stopServer();
}

/**
 * Show status of servers
 */
export async function showServerStatus(): Promise<void> {
  const registry = ServerRegistry.getInstance();
  
  // Clean up dead servers first
  await registry.cleanupDeadServers();
  
  const server = registry.getServerByPath("GLOBAL");
  if (!server) {
    console.log(`No global server registered`);
    return;
  }
  
  const running = await isServerRunning();
  console.log(`Global LSP Server:`);
  console.log(`   Status: ${running ? '🟢 Running' : '🔴 Not responding'}`);
  console.log(`   PID: ${server.pid}`);
  console.log(`   Socket: ${server.socket_path}`);
  console.log(`   Started: ${server.start_time}`);
  console.log(`   Last response: ${server.last_response}`);
}

/**
 * Stop idle servers (not applicable for global server)
 */
export async function stopIdleServers(idleMinutes: number): Promise<void> {
  // Global server should stay running, so we don't stop it for being idle
  console.log("Global server does not auto-stop when idle");
}

/**
 * Reset deduplication (sends to global server)
 */
export async function resetDeduplication(projectRoot: string): Promise<void> {
  const socketPath = getGlobalSocketPath();
  
  try {
    const response = await fetch('http://localhost/reset-dedup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ project: projectRoot }),
      // @ts-ignore - Bun supports unix option
      unix: socketPath,
      signal: AbortSignal.timeout(5000)
    });
    
    if (response.ok) {
      const result = await response.json();
      console.log(`✅ ${result.message}`);
    } else {
      console.error("❌ Failed to reset deduplication");
    }
  } catch (error) {
    console.error("❌ Server not responding or not running");
  }
}