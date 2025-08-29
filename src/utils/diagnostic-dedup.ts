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

    // Note: diagnostic_reports table removed - was only used for first run check
    
    // Note: diagnostic_reports update removed

    // Table for tracking individual language server processes (typescript, python, etc.)
    this.db.run(`
      CREATE TABLE IF NOT EXISTS individual_language_servers (
        project_hash TEXT NOT NULL,
        language TEXT NOT NULL,
        pid INTEGER NOT NULL,
        started_at INTEGER NOT NULL,
        last_checked INTEGER NOT NULL,
        socket_path TEXT,
        status TEXT NOT NULL DEFAULT 'starting' CHECK (status IN ('starting', 'healthy', 'unhealthy', 'stopped')),
        PRIMARY KEY (project_hash, language)
      )
    `);

    // Clean up stale individual language server entries on startup
    this.cleanupStaleIndividualLanguageServers().catch(() => {});
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
   * Simplified: check if any diagnostics exist in history
   */
  isFirstRun(): boolean {
    const result = this.db.prepare(`
      SELECT COUNT(*) as count FROM diagnostic_history WHERE project_hash = ?
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

  shouldShowNoErrorsState(): boolean {
    const NO_ERRORS_KEY = 'no-errors-state';
    
    // Check if we already showed "no errors" state recently (within 5 minutes)
    const existing = this.db.prepare(`
      SELECT last_seen FROM diagnostic_history 
      WHERE diagnostic_key = ? AND project_hash = ?
      AND last_seen > ?
    `).get(NO_ERRORS_KEY, this.projectHash, Date.now() - 5 * 60 * 1000);
    
    if (existing) {
      return false; // Already showed recently
    }
    
    // Mark that we're showing "no errors" state now
    this.db.prepare(`
      INSERT OR REPLACE INTO diagnostic_history 
      (project_hash, diagnostic_key, file_path, line, column, severity, message, source, rule_id, first_seen, last_seen, session_id)
      VALUES (?, ?, '', 0, 0, 'info', 'no-errors-state', null, null, ?, ?, null)
    `).run(NO_ERRORS_KEY, this.projectHash, Date.now(), Date.now());
    
    return true; // Show it
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

  // Individual Language Server Management Methods
  registerLanguageServer(projectHash: string, language: string, pid: number, socketPath?: string): void {
    const now = Date.now();
    this.db.run(`
      INSERT OR REPLACE INTO individual_language_servers 
      (project_hash, language, pid, started_at, last_checked, socket_path, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [projectHash, language, pid, now, now, socketPath || null, 'starting']);
  }

  getLanguageServer(projectHash: string, language: string): { pid: number; socket_path: string | null; status: string } | null {
    const result = this.db.prepare(`
      SELECT pid, socket_path, status FROM individual_language_servers
      WHERE project_hash = ? AND language = ?
    `).get(projectHash, language) as { pid: number; socket_path: string | null; status: string } | undefined;

    if (result) {
      // Check if the process is still alive
      if (this.isPidAlive(result.pid)) {
        // Update last_checked timestamp and status
        this.db.run(`
          UPDATE individual_language_servers 
          SET last_checked = ?, status = ?
          WHERE project_hash = ? AND language = ?
        `, [Date.now(), 'healthy', projectHash, language]);
        return { ...result, status: 'healthy' };
      } else {
        // Process is dead, mark as stopped
        this.db.run(`
          UPDATE individual_language_servers 
          SET status = ?
          WHERE project_hash = ? AND language = ?
        `, ['stopped', projectHash, language]);
        return null;
      }
    }
    return null;
  }

  removeLanguageServer(projectHash: string, language: string): void {
    this.db.run(`
      DELETE FROM individual_language_servers
      WHERE project_hash = ? AND language = ?
    `, [projectHash, language]);
  }

  getAllLanguageServers(): Array<{ project_hash: string; language: string; pid: number; status: string }> {
    return this.db.prepare(`
      SELECT project_hash, language, pid, status FROM individual_language_servers
    `).all() as Array<{ project_hash: string; language: string; pid: number; status: string }>;
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

  private async cleanupStaleIndividualLanguageServers(): Promise<void> {
    const servers = this.getAllLanguageServers();
    let cleaned = 0;
    for (const server of servers) {
      if (!this.isPidAlive(server.pid)) {
        // Mark as stopped instead of removing
        this.db.run(`
          UPDATE individual_language_servers 
          SET status = ?
          WHERE project_hash = ? AND language = ?
        `, ['stopped', server.project_hash, server.language]);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      await logger.info(`Cleaned up ${cleaned} stale individual language server entries`);
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