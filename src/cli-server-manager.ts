/**
 * CLI Server Manager
 * 
 * Manages the lifecycle of claude-lsp-server instances.
 * Handles starting, stopping, and health checking servers.
 */

import { spawn } from "child_process";
import { existsSync } from "fs";
import { join } from "path";
import { secureHash } from "./utils/security";
import { ServerRegistry } from "./utils/server-registry";
import { logger } from "./utils/logger";

/**
 * Check if a server is running for a project
 */
export async function isServerRunning(projectRoot: string): Promise<boolean> {
  const projectHash = secureHash(projectRoot).substring(0, 16);
  
  // Use same socket directory as server
  const socketDir = process.env.XDG_RUNTIME_DIR || 
                   (process.platform === 'darwin' 
                     ? `${process.env.HOME}/Library/Application Support/claude-lsp/run`
                     : `${process.env.HOME}/.claude-lsp/run`);
  const socketPath = `${socketDir}/claude-lsp-${projectHash}.sock`;
  
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
 * Ensure server is running for a project
 */
export async function ensureServerRunning(projectRoot: string): Promise<string> {
  const projectHash = secureHash(projectRoot).substring(0, 16);
  
  // Use same socket directory as server
  const socketDir = process.env.XDG_RUNTIME_DIR || 
                   (process.platform === 'darwin' 
                     ? `${process.env.HOME}/Library/Application Support/claude-lsp/run`
                     : `${process.env.HOME}/.claude-lsp/run`);
  const socketPath = `${socketDir}/claude-lsp-${projectHash}.sock`;
  const registry = ServerRegistry.getInstance();
  
  // Check registry first
  const existingServer = registry.getServerByPath(projectRoot);
  
  if (existingServer) {
    // Ping to verify it's actually running
    const running = await isServerRunning(projectRoot);
    
    if (running) {
      // Update heartbeat
      registry.updateHeartbeat(projectHash);
      return socketPath;
    }
    
    // Server in registry but not responding - clean up
    registry.markServerStopped(projectHash);
  }
  
  // Start new server
  const serverPath = findServerBinary();
  if (!serverPath) {
    throw new Error('claude-lsp-server binary not found');
  }
  
  const child = spawn(serverPath, [projectRoot], {
    stdio: 'ignore',
    detached: true
  });
  
  child.unref();
  
  // Register in SQLite
  const startTime = new Date().toISOString();
  registry.registerServer({
    project_hash: projectHash,
    project_root: projectRoot,
    pid: child.pid!,
    socket_path: socketPath,
    start_time: startTime,
    last_heartbeat: startTime,
    last_response: startTime,
    status: 'starting'
  });
  
  // Wait for server to be ready
  const maxWait = 30000; // 30 seconds
  const startWait = Date.now();
  
  while (Date.now() - startWait < maxWait) {
    if (await isServerRunning(projectRoot)) {
      registry.updateStatus(projectHash, 'running');
      return socketPath;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  // Timeout - clean up
  registry.markServerStopped(projectHash);
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
 * Start a server for a project
 */
export async function startServer(projectRoot: string): Promise<void> {
  const projectHash = secureHash(projectRoot).substring(0, 16);
  const registry = ServerRegistry.getInstance();
  
  // Check if already running
  if (await isServerRunning(projectRoot)) {
    console.log(`✅ Server already running for: ${projectRoot}`);
    return;
  }
  
  console.log(`Starting LSP server for: ${projectRoot}`);
  
  try {
    const socketPath = await ensureServerRunning(projectRoot);
    console.log(`✅ Server started successfully`);
    console.log(`   Socket: ${socketPath}`);
    console.log(`   Hash: ${projectHash}`);
  } catch (error) {
    console.error(`❌ Failed to start server: ${error}`);
    throw error;
  }
}

/**
 * Stop a server for a project
 */
export async function stopServer(projectRoot: string): Promise<void> {
  const projectHash = secureHash(projectRoot).substring(0, 16);
  const registry = ServerRegistry.getInstance();
  
  const server = registry.getServerByPath(projectRoot);
  if (!server) {
    console.log(`No server running for: ${projectRoot}`);
    return;
  }
  
  console.log(`Stopping server for: ${projectRoot}`);
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
      registry.markServerStopped(projectHash);
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
  
  registry.markServerStopped(projectHash);
}

/**
 * Stop all running servers
 */
export async function stopAllServers(): Promise<void> {
  const registry = ServerRegistry.getInstance();
  const servers = registry.getAllActiveServers();
  
  if (servers.length === 0) {
    console.log("No active servers to stop");
    return;
  }
  
  console.log(`Stopping ${servers.length} server(s)...`);
  
  for (const server of servers) {
    await stopServer(server.project_root);
  }
  
  // Clean up dead entries
  const deadCount = await registry.cleanupDeadServers();
  if (deadCount > 0) {
    console.log(`Cleaned up ${deadCount} dead server entries`);
  }
}

/**
 * Stop idle servers
 */
export async function stopIdleServers(idleMinutes: number): Promise<void> {
  const registry = ServerRegistry.getInstance();
  const servers = registry.getAllActiveServers();
  
  const idleMs = idleMinutes * 60 * 1000;
  const now = Date.now();
  let stoppedCount = 0;
  
  for (const server of servers) {
    const lastResponse = new Date(server.last_response).getTime();
    const idleTime = now - lastResponse;
    
    if (idleTime > idleMs) {
      console.log(`Stopping idle server: ${server.project_root}`);
      console.log(`   Idle for: ${Math.floor(idleTime / 60000)} minutes`);
      await stopServer(server.project_root);
      stoppedCount++;
    }
  }
  
  if (stoppedCount === 0) {
    console.log(`No servers idle for more than ${idleMinutes} minutes`);
  } else {
    console.log(`✅ Stopped ${stoppedCount} idle server(s)`);
  }
}

/**
 * Show status of servers
 */
export async function showServerStatus(projectRoot?: string): Promise<void> {
  const registry = ServerRegistry.getInstance();
  
  // Clean up dead servers first
  await registry.cleanupDeadServers();
  
  if (projectRoot) {
    // Show status for specific project
    const server = registry.getServerByPath(projectRoot);
    if (!server) {
      console.log(`No server registered for: ${projectRoot}`);
      return;
    }
    
    const running = await isServerRunning(projectRoot);
    console.log(`Project: ${projectRoot}`);
    console.log(`   Status: ${running ? '🟢 Running' : '🔴 Not responding'}`);
    console.log(`   PID: ${server.pid}`);
    console.log(`   Socket: ${server.socket_path}`);
    console.log(`   Started: ${server.start_time}`);
    console.log(`   Last response: ${server.last_response}`);
  } else {
    // Show all servers
    const servers = registry.getAllActiveServers();
    
    if (servers.length === 0) {
      console.log("No active servers");
      return;
    }
    
    console.log(`Active servers: ${servers.length}`);
    console.log("");
    
    for (const server of servers) {
      const running = await isServerRunning(server.project_root);
      console.log(`📁 ${server.project_root}`);
      console.log(`   Status: ${running ? '🟢 Running' : '🔴 Not responding'}`);
      console.log(`   PID: ${server.pid}`);
      console.log("");
    }
    
    // Show statistics
    const stats = registry.getStatistics();
    console.log("Statistics:");
    console.log(`   Total servers: ${stats.total_servers}`);
    console.log(`   Running: ${stats.running_servers}`);
    console.log(`   Starting: ${stats.starting_servers}`);
    console.log(`   Unhealthy: ${stats.unhealthy_servers}`);
  }
}

/**
 * Reset deduplication for a project
 */
export async function resetDeduplication(projectRoot: string): Promise<void> {
  const projectHash = secureHash(projectRoot).substring(0, 16);
  
  // Use same socket directory as server
  const socketDir = process.env.XDG_RUNTIME_DIR || 
                   (process.platform === 'darwin' 
                     ? `${process.env.HOME}/Library/Application Support/claude-lsp/run`
                     : `${process.env.HOME}/.claude-lsp/run`);
  const socketPath = `${socketDir}/claude-lsp-${projectHash}.sock`;
  
  try {
    const response = await fetch('http://localhost/reset-dedup', {
      method: 'POST',
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