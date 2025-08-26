/**
 * Diagnostic Deduplication System
 * Implements exactly-once delivery for diagnostics using SQLite persistence
 */

import { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from "fs";
import { relative, resolve, normalize } from "path";
import { secureHash } from "./security";
import { logger } from "./logger";

interface Diagnostic {
  file: string;
  line: number;
  column: number;
  severity: 'error' | 'warning' | 'hint' | 'info';
  message: string;
  source?: string;
  ruleId?: string;
}

interface DiagnosticDiff {
  added: Diagnostic[];      // New diagnostics not seen before
  resolved: Diagnostic[];    // Previous diagnostics that are now gone
  unchanged: Diagnostic[];   // Diagnostics that persist
}

export class DiagnosticDeduplicator {
  private db: Database;
  private projectHash: string;
  private projectPath: string;
  // Time window for considering diagnostics as "recent" (configurable via CLAUDE_LSP_RETENTION_HOURS)
  // After this time, a resolved diagnostic can be reported again if it reappears
  private readonly DIAGNOSTIC_MEMORY_WINDOW = this.getRetentionWindow();

  constructor(projectPath: string) {
    this.projectPath = normalize(projectPath);
    this.projectHash = secureHash(projectPath).substring(0, 16);
    
    // Initialize SQLite database
    const claudeHome = process.env.CLAUDE_HOME || `${process.env.HOME || process.env.USERPROFILE}/.claude`;
    const dataDir = `${claudeHome}/data`;
    
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }
    
    this.db = new Database(`${dataDir}/claude-code-lsp.db`);
    this.initializeSchema();
  }

  private getRetentionWindow(): number {
    const hoursEnv = process.env.CLAUDE_LSP_RETENTION_HOURS;
    const hours = hoursEnv ? parseInt(hoursEnv, 10) : 24;
    
    // Validate the hours value (must be positive)
    if (isNaN(hours) || hours <= 0) {
      // Note: Not awaited since this is called from constructor
      logger.warn(`Invalid CLAUDE_LSP_RETENTION_HOURS value: ${hoursEnv}. Using default 24 hours.`).catch(() => {});
      return 24 * 60 * 60 * 1000; // 24 hours in milliseconds
    }
    
    return hours * 60 * 60 * 1000; // Convert hours to milliseconds
  }

  private initializeSchema(): void {
    // Create diagnostic history table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS diagnostic_history (
        project_hash TEXT NOT NULL,
        diagnostic_key TEXT NOT NULL,
        file_path TEXT NOT NULL,
        line INTEGER NOT NULL,
        column INTEGER NOT NULL,
        severity TEXT NOT NULL,
        message TEXT NOT NULL,
        source TEXT,
        rule_id TEXT,
        first_seen INTEGER NOT NULL,
        last_seen INTEGER NOT NULL,
        session_id TEXT,
        PRIMARY KEY (project_hash, diagnostic_key)
      )
    `);

    // Create index for faster queries
    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_diagnostic_project 
      ON diagnostic_history (project_hash, last_seen)
    `);

    // Table for tracking last report time
    this.db.run(`
      CREATE TABLE IF NOT EXISTS diagnostic_reports (
        project_hash TEXT PRIMARY KEY,
        last_report_time INTEGER NOT NULL,
        last_report_hash TEXT,
        diagnostics_count INTEGER DEFAULT 0
      )
    `);

    // Table for tracking language server processes
    this.db.run(`
      CREATE TABLE IF NOT EXISTS language_servers (
        project_hash TEXT NOT NULL,
        language TEXT NOT NULL,
        pid INTEGER NOT NULL,
        started_at INTEGER NOT NULL,
        last_checked INTEGER NOT NULL,
        socket_path TEXT,
        PRIMARY KEY (project_hash, language)
      )
    `);

    // Clean up stale language server entries on startup
    this.cleanupStaleLanguageServers().catch(() => {});
  }

  private normalizePath(filePath: string): string {
    // Normalize the file path to be relative to project root
    try {
      const absolutePath = resolve(this.projectPath, filePath);
      const relativePath = relative(this.projectPath, absolutePath);
      
      // If the file is outside the project root, use the absolute path
      if (relativePath.startsWith('..')) {
        return normalize(absolutePath);
      }
      
      return relativePath;
    } catch (error) {
      // Fallback to original path if normalization fails
      return filePath;
    }
  }

  private createDiagnosticKey(diag: Diagnostic): string {
    // Normalize the file path before creating the key
    const normalizedPath = this.normalizePath(diag.file);
    // Create a unique key for each diagnostic using normalized path
    return secureHash(`${normalizedPath}:${diag.line}:${diag.column}:${diag.message}`).substring(0, 16);
  }

  private createReportHash(diagnostics: Diagnostic[]): string {
    // Sort diagnostics for consistent hashing
    const sorted = [...diagnostics].sort((a, b) => {
      if (a.file !== b.file) return a.file.localeCompare(b.file);
      if (a.line !== b.line) return a.line - b.line;
      if (a.column !== b.column) return a.column - b.column;
      return a.message.localeCompare(b.message);
    });
    
    // Create hash of all diagnostics
    const combinedString = sorted.map(d => 
      `${d.file}:${d.line}:${d.column}:${d.severity}:${d.message}`
    ).join('|');
    
    return secureHash(combinedString).substring(0, 32);
  }

  /**
   * Process diagnostics and return only new items to display
   * Returns array of diagnostics not seen before (filtered)
   */
  async processDiagnostics(
    currentDiagnostics: Diagnostic[], 
    sessionId?: string
  ): Promise<Diagnostic[]> {
    const now = Date.now();
    
    // Get previous diagnostics from database (within memory window)
    const previousDiagnostics = this.db.prepare(`
      SELECT diagnostic_key, file_path, line, column, severity, message, source, rule_id
      FROM diagnostic_history
      WHERE project_hash = ?
      AND last_seen >= ?
    `).all(this.projectHash, now - this.DIAGNOSTIC_MEMORY_WINDOW) as any[];

    // Create maps for comparison
    const previousMap = new Map<string, Diagnostic>();
    const currentMap = new Map<string, Diagnostic>();
    
    // Build previous map
    for (const prev of previousDiagnostics) {
      previousMap.set(prev.diagnostic_key, {
        file: prev.file_path,
        line: prev.line,
        column: prev.column,
        severity: prev.severity,
        message: prev.message,
        source: prev.source,
        ruleId: prev.rule_id
      });
    }
    
    // Build current map WITHOUT updating database yet
    // Only displayed items will be added to DB later via markAsDisplayed
    for (const diag of currentDiagnostics) {
      const key = this.createDiagnosticKey(diag);
      currentMap.set(key, diag);
    }

    // Compute new items to display
    const newItemsToDisplay: Diagnostic[] = [];
    
    // Find only NEW diagnostics not seen before (not in dedup DB)
    for (const [key, diag] of currentMap.entries()) {
      if (!previousMap.has(key)) {
        // New diagnostic not seen before - should be displayed
        newItemsToDisplay.push(diag);
      }
      // Note: Items that ARE in previousMap are filtered out (already displayed)
    }

    await logger.debug('Diagnostic filtering complete', {
      projectHash: this.projectHash,
      totalCurrent: currentDiagnostics.length,
      newItems: newItemsToDisplay.length,
      filtered: currentDiagnostics.length - newItemsToDisplay.length
    });

    // Return filtered array - empty array means nothing new to display
    return newItemsToDisplay;
  }

  /**
   * Check if this is the first run for a project
   */
  isFirstRun(): boolean {
    const result = this.db.prepare(`
      SELECT COUNT(*) as count FROM diagnostic_reports WHERE project_hash = ?
    `).get(this.projectHash) as any;
    
    return result.count === 0;
  }

  /**
   * Mark specific diagnostics as displayed (add to dedup database)
   * Only the displayed items should be added, so non-displayed items remain "new"
   */
  markAsDisplayed(displayedDiagnostics: Diagnostic[], sessionId?: string): void {
    const now = Date.now();
    const stmt = this.db.prepare(`
      INSERT INTO diagnostic_history (
        project_hash, diagnostic_key, file_path, line, column, 
        severity, message, source, rule_id, first_seen, last_seen, session_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(project_hash, diagnostic_key) DO UPDATE SET
        last_seen = excluded.last_seen,
        session_id = excluded.session_id
    `);

    for (const diag of displayedDiagnostics) {
      const key = this.createDiagnosticKey(diag);
      stmt.run(
        this.projectHash,
        key,
        this.normalizePath(diag.file),
        diag.line,
        diag.column,
        diag.severity,
        diag.message,
        diag.source || null,
        diag.ruleId || null,
        now,
        now,
        sessionId || null
      );
    }
  }

  /**
   * Clean up old diagnostics (older than retention window)
   */
  cleanup(): void {
    const cutoffTime = Date.now() - this.DIAGNOSTIC_MEMORY_WINDOW;
    this.db.run(`
      DELETE FROM diagnostic_history 
      WHERE project_hash = ? AND last_seen < ?
    `, [this.projectHash, cutoffTime]);
  }

  close(): void {
    this.db.close();
  }

  // Language Server Management Methods
  registerLanguageServer(projectHash: string, language: string, pid: number, socketPath?: string): void {
    const now = Date.now();
    this.db.run(`
      INSERT OR REPLACE INTO language_servers 
      (project_hash, language, pid, started_at, last_checked, socket_path)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [projectHash, language, pid, now, now, socketPath || null]);
  }

  getLanguageServer(projectHash: string, language: string): { pid: number; socket_path: string | null } | null {
    const result = this.db.prepare(`
      SELECT pid, socket_path FROM language_servers
      WHERE project_hash = ? AND language = ?
    `).get(projectHash, language) as { pid: number; socket_path: string | null } | undefined;

    if (result) {
      // Check if the process is still alive
      if (this.isPidAlive(result.pid)) {
        // Update last_checked timestamp
        this.db.run(`
          UPDATE language_servers 
          SET last_checked = ?
          WHERE project_hash = ? AND language = ?
        `, [Date.now(), projectHash, language]);
        return result;
      } else {
        // Process is dead, clean up the entry
        this.removeLanguageServer(projectHash, language);
        return null;
      }
    }
    return null;
  }

  removeLanguageServer(projectHash: string, language: string): void {
    this.db.run(`
      DELETE FROM language_servers
      WHERE project_hash = ? AND language = ?
    `, [projectHash, language]);
  }

  getAllLanguageServers(): Array<{ project_hash: string; language: string; pid: number }> {
    return this.db.prepare(`
      SELECT project_hash, language, pid FROM language_servers
    `).all() as Array<{ project_hash: string; language: string; pid: number }>;
  }

  private isPidAlive(pid: number): boolean {
    try {
      // Send signal 0 to check if process exists
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  private async cleanupStaleLanguageServers(): Promise<void> {
    const servers = this.getAllLanguageServers();
    let cleaned = 0;
    for (const server of servers) {
      if (!this.isPidAlive(server.pid)) {
        this.removeLanguageServer(server.project_hash, server.language);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      await logger.info(`Cleaned up ${cleaned} stale language server entries`);
    }
  }

  /**
   * Reset all diagnostic history for this project
   * This allows previously seen diagnostics to be displayed again
   */
  async resetAll(): Promise<void> {
    try {
      await logger.info(`Resetting all diagnostic history for project: ${this.projectHash}`);
      
      // Clear all diagnostic history for this project
      const result = this.db.run(`
        DELETE FROM diagnostic_history 
        WHERE project_hash = ?
      `, [this.projectHash]);
      
      await logger.info(`Reset complete: removed ${result.changes} diagnostic entries`);
    } catch (error) {
      await logger.error('Failed to reset diagnostic history', error);
      throw error;
    }
  }
}