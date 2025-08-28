import { ServerRegistry } from './server-registry';
import { logger } from './logger';
import { spawn } from 'child_process';

export class ServerMonitor {
  private static instance: ServerMonitor;
  private readonly MAX_UNRESPONSIVE_TIME_MS = 120000; // 2 minutes
  private lastCheckTimes = new Map<string, number>(); // Track last check per server
  private readonly MIN_CHECK_INTERVAL_MS = 60000; // Don't check same server more than once per minute
  
  private constructor() {}
  
  static getInstance(): ServerMonitor {
    if (!ServerMonitor.instance) {
      ServerMonitor.instance = new ServerMonitor();
    }
    return ServerMonitor.instance;
  }
  
  // Check server health only when actually needed (on-demand)
  async ensureServerHealthy(projectRoot: string): Promise<boolean> {
    const registry = ServerRegistry.getInstance();
    const server = registry.getServerByPath(projectRoot);
    
    if (!server) {
      return false;
    }
    
    // Don't check too frequently
    const lastCheck = this.lastCheckTimes.get(server.project_hash) || 0;
    if (Date.now() - lastCheck < this.MIN_CHECK_INTERVAL_MS) {
      // Assume healthy if checked recently
      return true;
    }
    
    this.lastCheckTimes.set(server.project_hash, Date.now());
    
    // Quick health check
    const healthy = await this.pingServer(server.socket_path);
    
    if (!healthy) {
      // Check how long it's been unresponsive
      const lastResponse = new Date(server.last_response).getTime();
      const unresponsiveTime = Date.now() - lastResponse;
      
      if (unresponsiveTime > this.MAX_UNRESPONSIVE_TIME_MS) {
        await logger.warn('Server unresponsive, restarting', {
          project: projectRoot,
          unresponsiveMs: unresponsiveTime
        });
        
        await this.restartServer(server);
        return false; // Server was unhealthy, restarted
      }
    } else {
      // Update heartbeat only on successful ping
      registry.updateHeartbeat(server.project_hash);
    }
    
    return healthy;
  }
  
  private async checkServers(): Promise<void> {
    const registry = ServerRegistry.getInstance();
    const servers = registry.getAllActiveServers();
    
    for (const server of servers) {
      try {
        // Check if process is alive
        process.kill(server.pid, 0);
        
        // Try to ping the server via socket
        const healthy = await this.pingServer(server.socket_path);
        
        if (healthy) {
          // Update heartbeat
          registry.updateHeartbeat(server.project_hash);
          await logger.debug('Server healthy', { 
            project: server.project_root,
            pid: server.pid 
          });
        } else {
          // Check how long it's been unresponsive
          const lastResponse = new Date(server.last_response).getTime();
          const unresponsiveTime = Date.now() - lastResponse;
          
          if (unresponsiveTime > this.MAX_UNRESPONSIVE_TIME_MS) {
            await logger.warn('Server unresponsive for too long, restarting', {
              project: server.project_root,
              pid: server.pid,
              unresponsiveMs: unresponsiveTime
            });
            
            await this.restartServer(server);
          } else {
            await logger.debug('Server not responding but within timeout', {
              project: server.project_root,
              unresponsiveMs: unresponsiveTime
            });
          }
        }
      } catch (error) {
        // Process doesn't exist
        await logger.warn('Server process not found, marking as stopped', {
          project: server.project_root,
          pid: server.pid
        });
        registry.markServerStopped(server.project_hash);
      }
    }
    
    // Clean up any dead servers
    await registry.cleanupDeadServers();
  }
  
  private async pingServer(socketPath: string): Promise<boolean> {
    try {
      const response = await fetch('http://localhost/health', {
        // @ts-ignore - Bun supports unix option
        unix: socketPath,
        signal: AbortSignal.timeout(5000) // 5 second timeout for health check
      });
      
      return response.ok;
    } catch (error) {
      return false;
    }
  }
  
  private async restartServer(server: any): Promise<void> {
    const registry = ServerRegistry.getInstance();
    
    try {
      // First, try graceful shutdown
      try {
        await fetch('http://localhost/shutdown', {
          method: 'POST',
          // @ts-ignore - Bun supports unix option
          unix: server.socket_path,
          signal: AbortSignal.timeout(3000)
        });
        await logger.debug('Sent graceful shutdown request');
      } catch {
        // Ignore errors, will force kill
      }
      
      // Force kill if still alive
      try {
        process.kill(server.pid, 'SIGKILL');
        await logger.debug('Force killed server', { pid: server.pid });
      } catch {
        // Process already dead
      }
      
      // Mark as stopped in registry
      registry.markServerStopped(server.project_hash);
      
      // Clean up socket file
      try {
        const fs = await import('fs');
        if (fs.existsSync(server.socket_path)) {
          fs.unlinkSync(server.socket_path);
        }
      } catch (error) {
        await logger.error('Failed to clean up socket', { error });
      }
      
      // Wait a moment before restarting
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Restart the server
      const serverBinaryPath = process.env.CLAUDE_LSP_SERVER_PATH || './bin/claude-lsp-server';
      
      await logger.info('Restarting LSP server', { 
        project: server.project_root,
        binary: serverBinaryPath 
      });
      
      const child = spawn(serverBinaryPath, [server.project_root], {
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: true
      });
      
      child.unref();
      
      // Register the new server
      const detectedLanguages = server.languages || ['typescript'];
      registry.registerServer(
        server.project_root,
        detectedLanguages,
        child.pid!,
        server.socket_path
      );
      
      await logger.info('Server restarted successfully', {
        project: server.project_root,
        newPid: child.pid
      });
      
    } catch (error) {
      await logger.error('Failed to restart server', {
        error,
        project: server.project_root
      });
    }
  }
  
  // Manual restart for a specific server
  async restartServerForProject(projectRoot: string): Promise<void> {
    const registry = ServerRegistry.getInstance();
    const server = registry.getServerByPath(projectRoot);
    
    if (!server) {
      await logger.warn('No server found to restart', { projectRoot });
      return;
    }
    
    await this.restartServer(server);
  }
}