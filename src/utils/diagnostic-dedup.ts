/**
 * Diagnostic Deduplication System
 * Implements exactly-once delivery for diagnostics using SQLite persistence
 */

import { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from "fs";
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
  // Time window for considering diagnostics as "recent" (default: 4 hours)
  // After this time, a resolved diagnostic can be reported again if it reappears
  private readonly DIAGNOSTIC_MEMORY_WINDOW = 4 * 60 * 60 * 1000; // 4 hours

  constructor(projectPath: string) {
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
  }

  private createDiagnosticKey(diag: Diagnostic): string {
    // Create a unique key for each diagnostic
    return secureHash(`${diag.file}:${diag.line}:${diag.column}:${diag.message}`).substring(0, 16);
  }

  /**
   * Process diagnostics and return only the changes
   */
  async processDiagnostics(
    currentDiagnostics: Diagnostic[], 
    sessionId?: string
  ): Promise<{ diff: DiagnosticDiff; shouldReport: boolean }> {
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
    
    // Build current map and update database
    const stmt = this.db.prepare(`
      INSERT INTO diagnostic_history (
        project_hash, diagnostic_key, file_path, line, column, 
        severity, message, source, rule_id, first_seen, last_seen, session_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(project_hash, diagnostic_key) DO UPDATE SET
        last_seen = excluded.last_seen,
        session_id = excluded.session_id
    `);

    for (const diag of currentDiagnostics) {
      const key = this.createDiagnosticKey(diag);
      currentMap.set(key, diag);
      
      // Upsert into database
      stmt.run(
        this.projectHash,
        key,
        diag.file,
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

    // Compute diff
    const added: Diagnostic[] = [];
    const resolved: Diagnostic[] = [];
    const unchanged: Diagnostic[] = [];

    // Check if this is the first report for this project
    const isFirstReport = this.isFirstRun();

    // Find added and unchanged
    for (const [key, diag] of currentMap.entries()) {
      if (!previousMap.has(key)) {
        // New diagnostic not seen before
        added.push(diag);
      } else {
        // Diagnostic was seen before and still exists
        unchanged.push(diag);
      }
    }

    // Find resolved
    for (const [key, diag] of previousMap.entries()) {
      if (!currentMap.has(key)) {
        resolved.push(diag);
      }
    }
    
    // Check if we should report
    // Report if: first report with diagnostics, or there are changes (added/resolved)
    const shouldReport = (isFirstReport && currentDiagnostics.length > 0) || 
                        added.length > 0 || 
                        resolved.length > 0;
    
    // Update last report time if reporting or if it's the first run
    if (shouldReport || isFirstReport) {
      this.db.run(`
        INSERT INTO diagnostic_reports (project_hash, last_report_time, diagnostics_count)
        VALUES (?, ?, ?)
        ON CONFLICT(project_hash) DO UPDATE SET
          last_report_time = excluded.last_report_time,
          diagnostics_count = excluded.diagnostics_count
      `, this.projectHash, now, currentDiagnostics.length);
    }

    await logger.debug('Diagnostic diff computed', {
      projectHash: this.projectHash,
      added: added.length,
      resolved: resolved.length,
      unchanged: unchanged.length,
      shouldReport
    });

    return {
      diff: { added, resolved, unchanged },
      shouldReport
    };
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
   * Clean up old diagnostics (older than 24 hours)
   */
  cleanup(): void {
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
    this.db.run(`
      DELETE FROM diagnostic_history 
      WHERE project_hash = ? AND last_seen < ?
    `, this.projectHash, oneDayAgo);
  }

  close(): void {
    this.db.close();
  }
}