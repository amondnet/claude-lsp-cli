/**
 * Server Registry - Manages tracking of LSP server instances
 * 
 * Tracks all LSP servers started by claude-lsp-cli with metadata:
 * - Project root path
 * - Languages running  
 * - Start time
 * - Last response time
 * - PID
 * - Health status
 */

import Database from 'bun:sqlite';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { secureHash } from './security';
import { logger } from './logger';

export interface ServerInfo {
  project_hash: string;
  project_root: string;
  languages: string[];
  pid: number;
  start_time: string;
  last_response: string;
  socket_path: string;
  status: 'starting' | 'healthy' | 'unhealthy' | 'stopped';
}

export class ServerRegistry {
  private db: Database;
  private static instance: ServerRegistry | null = null;
  
  private constructor() {
    // Ensure data directory exists
    const dataDir = process.env.HOME + '/.claude-lsp';
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }
    
    const dbPath = join(dataDir, 'server-registry.db');
    this.db = new Database(dbPath);
    
    // Initialize schema
    this.initializeSchema();
  }
  
  static getInstance(): ServerRegistry {
    if (!ServerRegistry.instance) {
      ServerRegistry.instance = new ServerRegistry();
    }
    return ServerRegistry.instance;
  }
  
  private initializeSchema() {
    // Create servers table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS servers (
        project_hash TEXT PRIMARY KEY,
        project_root TEXT NOT NULL,
        languages TEXT NOT NULL,  -- JSON array of languages
        pid INTEGER NOT NULL,
        start_time TEXT NOT NULL,
        last_response TEXT NOT NULL,
        socket_path TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('starting', 'healthy', 'unhealthy', 'stopped'))
      )
    `);
    
    // Create index for quick lookups
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_servers_status ON servers(status);
      CREATE INDEX IF NOT EXISTS idx_servers_pid ON servers(pid);
    `);
    
    // Note: server_events table removed - was unused logging
  }
  
  /**
   * Register a new server
   */
  registerServer(projectRoot: string, languages: string[], pid: number, socketPath: string): string {
    const projectHash = secureHash(projectRoot).substring(0, 16);
    const now = new Date().toISOString();
    
    try {
      // Insert or update server record
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO servers (
          project_hash, project_root, languages, pid, 
          start_time, last_response, socket_path, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      stmt.run(
        projectHash,
        projectRoot,
        JSON.stringify(languages),
        pid,
        now,
        now,
        socketPath,
        'starting'
      );
      
      // Log event
      // Note: Event logging removed
      
      logger.info(`Registered server for ${projectRoot} (${projectHash})`);
      return projectHash;
      
    } catch (error) {
      logger.error(`Failed to register server: ${error}`);
      throw error;
    }
  }
  
  /**
   * Update server status
   */
  updateServerStatus(projectHash: string, status: ServerInfo['status']) {
    const stmt = this.db.prepare(`
      UPDATE servers 
      SET status = ?, last_response = ?
      WHERE project_hash = ?
    `);
    
    stmt.run(status, new Date().toISOString(), projectHash);
    // Note: Event logging removed
  }
  
  /**
   * Update last response time (heartbeat)
   */
  updateHeartbeat(projectHash: string) {
    const stmt = this.db.prepare(`
      UPDATE servers 
      SET last_response = ?, status = 'healthy'
      WHERE project_hash = ?
    `);
    
    stmt.run(new Date().toISOString(), projectHash);
  }
  
  /**
   * Get server info by project hash
   */
  getServer(projectHash: string): ServerInfo | null {
    const stmt = this.db.prepare(`
      SELECT * FROM servers WHERE project_hash = ?
    `);
    
    const row = stmt.get(projectHash) as any;
    if (!row) return null;
    
    return {
      ...row,
      languages: JSON.parse(row.languages)
    };
  }
  
  /**
   * Get server by project root path
   */
  getServerByPath(projectRoot: string): ServerInfo | null {
    const projectHash = secureHash(projectRoot).substring(0, 16);
    return this.getServer(projectHash);
  }
  
  /**
   * Get all active servers
   */
  getAllActiveServers(): ServerInfo[] {
    const stmt = this.db.prepare(`
      SELECT * FROM servers 
      WHERE status IN ('starting', 'healthy', 'unhealthy')
      ORDER BY start_time DESC
    `);
    
    const rows = stmt.all() as any[];
    return rows.map(row => ({
      ...row,
      languages: JSON.parse(row.languages)
    }));
  }
  
  /**
   * Check and clean up dead servers
   */
  async cleanupDeadServers(): Promise<number> {
    const servers = this.getAllActiveServers();
    let cleanedCount = 0;
    
    for (const server of servers) {
      // Check if process is still running
      const isAlive = await this.isProcessAlive(server.pid);
      
      if (!isAlive) {
        this.markServerStopped(server.project_hash);
        cleanedCount++;
        logger.info(`Cleaned up dead server ${server.project_hash} (PID ${server.pid})`);
      } else {
        // Check if server is responsive (last response > 5 minutes ago)
        const lastResponse = new Date(server.last_response);
        const now = new Date();
        const minutesSinceResponse = (now.getTime() - lastResponse.getTime()) / 1000 / 60;
        
        if (minutesSinceResponse > 5) {
          this.updateServerStatus(server.project_hash, 'unhealthy');
        }
      }
    }
    
    return cleanedCount;
  }
  
  /**
   * Mark server as stopped
   */
  markServerStopped(projectHash: string) {
    this.updateServerStatus(projectHash, 'stopped');
    // Note: Event logging removed
  }
  
  /**
   * Check if a process is alive
   */
  private async isProcessAlive(pid: number): Promise<boolean> {
    try {
      // Send signal 0 to check if process exists
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }
  
  /**
   * Log server event
   */
  // Note: logEvent method removed - was unused
  
  /**
   * Enforce server limit by killing oldest servers
   */
  async enforceServerLimit(maxServers: number = 10): Promise<number> {
    const activeServers = this.getAllActiveServers();
    
    if (activeServers.length <= maxServers) {
      return 0; // No cleanup needed
    }
    
    // Sort by start time (oldest first) 
    const sortedServers = activeServers.sort((a, b) => 
      new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
    );
    
    // Kill servers that exceed the limit
    const serversToKill = sortedServers.slice(0, activeServers.length - maxServers);
    let killedCount = 0;
    
    for (const server of serversToKill) {
      try {
        // Try to kill the process
        process.kill(server.pid, 'SIGTERM');
        
        // Wait a bit then force kill if still alive
        setTimeout(async () => {
          if (await this.isProcessAlive(server.pid)) {
            try {
              process.kill(server.pid, 'SIGKILL');
            } catch {
              // Already dead
            }
          }
        }, 2000);
        
        // Mark as stopped in registry
        this.markServerStopped(server.project_hash);
        killedCount++;
        
        await logger.info(`Killed old server ${server.project_hash} (PID ${server.pid}) to enforce limit`);
        
      } catch (error) {
        await logger.warn(`Failed to kill server ${server.project_hash}: ${error}`);
      }
    }
    
    return killedCount;
  }

  /**
   * Get server statistics
   */
  getStatistics() {
    const activeCount = this.db.prepare(`
      SELECT COUNT(*) as count FROM servers WHERE status IN ('starting', 'healthy', 'unhealthy')
    `).get() as { count: number };
    
    const languageStats = this.db.prepare(`
      SELECT languages FROM servers WHERE status IN ('starting', 'healthy', 'unhealthy')
    `).all() as { languages: string }[];
    
    // Count languages
    const languageCounts: Record<string, number> = {};
    for (const row of languageStats) {
      const langs = JSON.parse(row.languages);
      for (const lang of langs) {
        languageCounts[lang] = (languageCounts[lang] || 0) + 1;
      }
    }
    
    return {
      activeServers: activeCount.count,
      languages: languageCounts
    };
  }
  
  /**
   * Close database connection
   */
  close() {
    this.db.close();
    ServerRegistry.instance = null;
  }
}