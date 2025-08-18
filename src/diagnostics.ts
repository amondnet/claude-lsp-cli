#!/usr/bin/env bun
import { relative } from "path";
import { appendFile } from "node:fs/promises";
import { Database } from "bun:sqlite";
import { ProjectConfigDetector } from "./project-config-detector";
import { mkdirSync, existsSync } from "fs";
import { 
  secureHash, 
  safeKillProcess, 
  safeDeleteFile,
  safeExecute,
  cleanupManager
} from "./utils/security";
import { logger } from "./utils/logger";

const logFileForRest = "/tmp/lsp-session-reset.log";

// LSP Client Functions
async function queryLSPCache(projectHash: string, filePath?: string): Promise<{ diagnostics: any[], timestamp: string } | null> {
  try {
    // Determine socket directory based on platform
    const socketDir = process.env.XDG_RUNTIME_DIR || 
                     (process.platform === 'darwin' 
                       ? `${process.env.HOME}/Library/Application Support/claude-lsp/run`
                       : `${process.env.HOME}/.claude-lsp/run`);
    
    const socketPath = `${socketDir}/claude-lsp-${projectHash}.sock`;
    // Query all project diagnostics if no specific file, or just one file if specified
    const url = filePath 
      ? `http://localhost/diagnostics?file=${encodeURIComponent(filePath)}`
      : `http://localhost/diagnostics/all`;
    // Bun uses 'unix' option for unix socket connections
    const response = await fetch(url, { unix: socketPath });
    if (response.ok) {
      return await response.json() as any;
    }
  } catch (error) {
    // LSP not running or not responding
    await logger.debug('LSP cache query failed', { projectHash, filePath, error });
  }
  return null;
}

async function isLSPRunning(projectHash: string): Promise<boolean> {
  try {
    // Determine socket directory based on platform
    const socketDir = process.env.XDG_RUNTIME_DIR || 
                     (process.platform === 'darwin' 
                       ? `${process.env.HOME}/Library/Application Support/claude-lsp/run`
                       : `${process.env.HOME}/.claude-lsp/run`);
    
    const socketPath = `${socketDir}/claude-lsp-${projectHash}.sock`;
    // Bun uses 'unix' option for unix socket connections
    const response = await fetch(`http://localhost/health`, { unix: socketPath });
    return response.ok;
  } catch (error) {
    await logger.debug('LSP health check failed', { projectHash, error });
    return false;
  }
}

// Async fire-and-forget cleanup of idle LSP servers with throttling
async function cleanupIdleLSPServers(maxIdleMinutes: number = 60): Promise<void> {
  try {
    // Run cleanup in background, don't wait for it
    setImmediate(async () => {
      try {
        const claudeHome = process.env.CLAUDE_HOME || `${process.env.HOME || process.env.USERPROFILE}/.claude`;
        
        // Ensure data directory exists
        if (!existsSync(`${claudeHome}/data`)) {
          mkdirSync(`${claudeHome}/data`, { recursive: true });
        }
        const lspDb = new Database(`${claudeHome}/data/claude-code-lsp.db`);
        
        try {
          // Check last cleanup time (throttle to once per 10 minutes)
          const lastCleanup = lspDb.prepare(`
            SELECT value FROM metadata WHERE key = 'last_idle_cleanup'
          `).get() as any;
          
          const now = Date.now();
          const tenMinutes = 10 * 60 * 1000;
          
          if (lastCleanup && (now - parseInt(lastCleanup.value)) < tenMinutes) {
            return; // Skip cleanup, too soon
          }
          
          // Update last cleanup time
          lspDb.prepare(`
            INSERT INTO metadata (key, value) VALUES ('last_idle_cleanup', ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
          `).run(now.toString());
          
          // Cleanup logic here
          await logger.info('Running LSP cleanup', { maxIdleMinutes });
          
        } finally {
          lspDb.close();
        }
      } catch (error) {
        await logger.error('LSP cleanup failed', error);
      }
    });
  } catch (error) {
    await logger.error('Failed to schedule LSP cleanup', error);
  }
}

// LSP Server Management Functions
async function ensureLSPServer(projectRoot: string, projectHash: string, sessionId?: string): Promise<void> {
  // Determine socket directory based on platform
  const socketDir = process.env.XDG_RUNTIME_DIR || 
                   (process.platform === 'darwin' 
                     ? `${process.env.HOME}/Library/Application Support/claude-lsp/run`
                     : `${process.env.HOME}/.claude-lsp/run`);
  
  // Ensure socket directory exists with proper permissions
  if (!existsSync(socketDir)) {
    mkdirSync(socketDir, { recursive: true, mode: 0o700 });
  }
  
  const pidFile = `${socketDir}/claude-lsp-${projectHash}.pid`;
  const socketFile = `${socketDir}/claude-lsp-${projectHash}.sock`;
  
  try {
    // Check if PID file exists and if process is running
    const pidExists = await Bun.file(pidFile).exists().catch(() => false);
    if (pidExists) {
      const pidContent = await Bun.file(pidFile).text().catch(() => "");
      const pid = parseInt(pidContent.trim());
      if (pid && !isNaN(pid)) {
        // Check if process is actually running
        try {
          process.kill(pid, 0); // Check if process exists
          // Process exists, check if LSP is responding
          if (await isLSPRunning(projectHash)) {
            await logger.info(`LSP server already running for project ${projectHash} with PID: ${pid}`);
            return;
          }
          await logger.info(`LSP server PID ${pid} exists but not responding, will restart`);
        } catch {
          await logger.info(`LSP server PID ${pid} not running, will start new`);
        }
      }
    }
    
    // Kill any existing process and clean up
    if (pidExists) {
      const pidContent = await Bun.file(pidFile).text().catch(() => "");
      const pid = parseInt(pidContent.trim());
      if (pid && !isNaN(pid)) {
        await safeKillProcess(pid);
      }
    }
    
    // Clean up old files using safe delete
    await safeDeleteFile(pidFile);
    await safeDeleteFile(socketFile);
    
    await logger.info(`Starting LSP for project: ${projectRoot} (${projectHash})`);
    
    // Auto-detect and configure project
    const detector = new ProjectConfigDetector(projectRoot);
    const projectConfig = await detector.detect();
    
    await logger.info(`Detected project config`, projectConfig);
    
    // Auto-create tsconfig if needed (for JSX support)
    if (projectConfig.hasJSX && !projectConfig.tsConfig) {
      await detector.createAutoTsConfig();
      await logger.info("Created auto-generated tsconfig.json for JSX support");
    }
    
    // Clear diagnostic cache for this project
    await clearProjectDiagnosticCache(projectRoot);
    
    // Start the new real LSP server
    // Try to find the binary - check multiple locations
    let lspServerPath = process.env.CLAUDE_LSP_SERVER_PATH;
    if (!lspServerPath) {
      // Check if we have the binary in a known location relative to this file
      const possiblePaths = [
        new URL("../bin/claude-lsp-server", import.meta.url).pathname,
        "claude-lsp-server" // Fallback to PATH
      ];
      
      for (const path of possiblePaths) {
        if (await Bun.file(path).exists().catch(() => false)) {
          lspServerPath = path;
          break;
        }
      }
      
      if (!lspServerPath) {
        lspServerPath = "claude-lsp-server"; // Final fallback
      }
    }
    
    await logger.info(`Using LSP server binary: ${lspServerPath}`);
    
    const proc = Bun.spawn([
      lspServerPath,
      projectRoot // The enhanced server expects just the project root
    ], {
      cwd: projectRoot,
      stdout: "ignore",
      stderr: "ignore", 
      stdin: "ignore"
    });
    
    // Register process for cleanup
    cleanupManager.registerProcess(proc.pid!, `LSP-${projectHash}`);
    
    // Write PID file for this project
    await Bun.write(pidFile, proc.pid.toString()).catch(async (error) => {
      await logger.error('Failed to write PID file', error, { pidFile });
    });
    
    // Store start time in a separate file for tracking uptime
    const startTimeFile = `${socketDir}/claude-lsp-${projectHash}.start`;
    await Bun.write(startTimeFile, Date.now().toString()).catch(async (error) => {
      await logger.error('Failed to write start time file', error, { startTimeFile });
    });
    
    // Register in database
    if (sessionId) {
      const claudeHome = process.env.CLAUDE_HOME || `${process.env.HOME || process.env.USERPROFILE}/.claude`;
      // Ensure data directory exists
      if (!existsSync(`${claudeHome}/data`)) {
        mkdirSync(`${claudeHome}/data`, { recursive: true });
      }
      const lspDb = new Database(`${claudeHome}/data/claude-code-lsp.db`);
      try {
        // Initialize database tables
        lspDb.exec(`
          CREATE TABLE IF NOT EXISTS lsp_instances (
            pid INTEGER PRIMARY KEY,
            project_hash TEXT UNIQUE,
            project_path TEXT,
            session_id TEXT,
            start_time INTEGER,
            last_seen INTEGER,
            status TEXT,
            socket_file TEXT,
            pid_file TEXT
          );
          
          CREATE TABLE IF NOT EXISTS metadata (
            key TEXT PRIMARY KEY,
            value TEXT
          );
        `);
        
        // Insert or update LSP instance
        lspDb.prepare(`
          INSERT INTO lsp_instances (pid, project_hash, project_path, session_id, start_time, last_seen, status, socket_file, pid_file)
          VALUES (?, ?, ?, ?, ?, ?, 'running', ?, ?)
          ON CONFLICT(project_hash) DO UPDATE SET
            pid = excluded.pid,
            session_id = excluded.session_id,
            start_time = excluded.start_time,
            last_seen = excluded.last_seen,
            status = 'running',
            socket_file = excluded.socket_file,
            pid_file = excluded.pid_file
        `).run(proc.pid, projectHash, projectRoot, sessionId, Date.now(), Date.now(), socketFile, pidFile);
        
        await logger.info(`Registered LSP server in database for session ${sessionId}`);
      } catch (error) {
        await logger.error('Failed to register LSP in database', error);
      } finally {
        lspDb.close();
      }
    }
    
    // Wait for server to be ready
    let retries = 20;
    while (retries > 0) {
      await new Promise(resolve => setTimeout(resolve, 500));
      if (await isLSPRunning(projectHash)) {
        await logger.info(`LSP server ready for project ${projectHash}`);
        break;
      }
      retries--;
    }
    
    if (retries === 0) {
      await logger.error('LSP server failed to start within timeout', undefined, { projectHash });
      throw new Error('LSP server failed to start');
    }
    
  } catch (error) {
    await logger.error('Failed to ensure LSP server', error, { projectRoot, projectHash });
    throw error;
  }
}

async function clearProjectDiagnosticCache(projectRoot: string): Promise<void> {
  const claudeHome = process.env.CLAUDE_HOME || `${process.env.HOME || process.env.USERPROFILE}/.claude`;
  
  try {
    // Ensure data directory exists
    if (!existsSync(`${claudeHome}/data`)) {
      mkdirSync(`${claudeHome}/data`, { recursive: true });
    }
    
    const db = new Database(`${claudeHome}/data/claude-code-lsp.db`);
    
    try {
      // Initialize tables if needed
      db.exec(`
        CREATE TABLE IF NOT EXISTS diagnostics (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          project_path TEXT,
          file_path TEXT,
          line INTEGER,
          column INTEGER,
          severity TEXT,
          message TEXT,
          source TEXT,
          timestamp INTEGER,
          session_id TEXT
        );
        
        CREATE INDEX IF NOT EXISTS idx_diagnostics_project ON diagnostics(project_path);
        CREATE INDEX IF NOT EXISTS idx_diagnostics_file ON diagnostics(file_path);
        CREATE INDEX IF NOT EXISTS idx_diagnostics_session ON diagnostics(session_id);
      `);
      
      // Clear diagnostics for this project
      const result = db.prepare(`
        DELETE FROM diagnostics 
        WHERE project_path = ?
      `).run(projectRoot);
      
      await logger.debug('Cleared diagnostic cache', { 
        projectRoot, 
        deletedRows: result.changes 
      });
      
    } finally {
      db.close();
    }
  } catch (error) {
    await logger.error('Failed to clear diagnostic cache', error, { projectRoot });
  }
}

async function logEntry(message: string, context?: any): Promise<void> {
  await logger.info(message, context);
}

async function logForReset(message: string): Promise<void> {
  try {
    await appendFile(logFileForRest, `${new Date().toISOString()} - ${message}\n`);
  } catch (error) {
    await logger.error('Failed to write to reset log', error);
  }
}

// Main diagnostic function
export async function runDiagnostics(
  projectRoot: string,
  filePath?: string,
  sessionId?: string
): Promise<any> {
  const projectHash = secureHash(projectRoot).substring(0, 16);
  
  logger.setProject(projectHash);
  
  try {
    // Ensure LSP server is running
    await ensureLSPServer(projectRoot, projectHash, sessionId);
    
    // Query diagnostics
    const result = await queryLSPCache(projectHash, filePath);
    
    if (!result) {
      await logger.warn('No diagnostics available from LSP server');
      return { diagnostics: [], timestamp: new Date().toISOString() };
    }
    
    return result;
    
  } catch (error) {
    await logger.error('Diagnostics run failed', error);
    throw error;
  }
}

// Hook handler for Claude Code integration
export async function handleHookEvent(eventType: string): Promise<void> {
  try {
    const input = await Bun.stdin.text();
    const hookData = JSON.parse(input);
    
    await logger.info('Processing hook event', { eventType, tool: hookData.tool });
    
    // Process based on event type
    if (eventType === 'PostToolUse') {
      // Run diagnostics after any tool - files could be modified externally
      // or through ways we don't detect (vim in bash, file watchers, etc.)
      const workingDir = hookData.workingDirectory || process.cwd();
      const projectRoot = await findProjectRoot(workingDir);
      if (projectRoot) {
        const diagnostics = await runDiagnostics(projectRoot, undefined, hookData.sessionId);
          
          // Output diagnostics as system message
          if (diagnostics.diagnostics && diagnostics.diagnostics.length > 0) {
            console.error(`[[system-message]]: ${JSON.stringify({
              status: 'diagnostics_report',
              result: 'errors_found',
              diagnostics: diagnostics.diagnostics,
              reference: {
                type: 'previous_code_edit',
                turn: 'claude_-1'
              }
            })}`);
          } else {
            console.error(`[[system-message]]: ${JSON.stringify({
              status: 'diagnostics_report',
              result: 'all_clear',
              reference: {
                type: 'previous_code_edit',
                turn: 'claude_-1'
              }
            })}`);
          }
        }
    } else if (eventType === 'SessionStart') {
      // Check initial project state
      if (hookData.workingDirectory) {
        const diagnostics = await runDiagnostics(hookData.workingDirectory);
        if (diagnostics.diagnostics && diagnostics.diagnostics.length > 0) {
          console.error(`[[system-message]]: ${JSON.stringify({
            status: 'diagnostics_report',
            result: 'initial_errors_found',
            diagnostics: diagnostics.diagnostics,
            summary: `Found ${diagnostics.diagnostics.length} issues in project on startup`
          })}`);
        }
      }
    } else if (eventType === 'Stop') {
      // Clean shutdown - stop LSP servers for this session
      if (hookData.workingDirectory || process.cwd()) {
        const projectRoot = hookData.workingDirectory || process.cwd();
        const projectHash = secureHash(projectRoot).substring(0, 16);
        
        // Stop LSP server gracefully
        try {
          const socketDir = process.env.XDG_RUNTIME_DIR || 
                           (process.platform === 'darwin' 
                             ? `${process.env.HOME}/Library/Application Support/claude-lsp/run`
                             : `${process.env.HOME}/.claude-lsp/run`);
          
          const response = await fetch('http://localhost/shutdown', { 
            method: 'POST',
            unix: `${socketDir}/claude-lsp-${projectHash}.sock`
          });
          
          if (response.ok) {
            await logger.info('LSP server shutdown successful', { projectHash });
          }
        } catch (error) {
          // Server already stopped or not running, that's fine
          await logger.debug('LSP server shutdown failed (probably already stopped)', { projectHash, error });
        }
      }
    }
    
  } catch (error) {
    await logger.error('Hook event processing failed', error);
  }
}

async function findProjectRoot(filePath: string): Promise<string | null> {
  // Implementation to find project root from file path
  // Walk up directory tree looking for .git, package.json, etc.
  let currentPath = filePath;
  
  while (currentPath !== '/') {
    if (existsSync(`${currentPath}/.git`) || 
        existsSync(`${currentPath}/package.json`) ||
        existsSync(`${currentPath}/pyproject.toml`)) {
      return currentPath;
    }
    
    const parent = currentPath.split('/').slice(0, -1).join('/');
    if (parent === currentPath) break;
    currentPath = parent;
  }
  
  return null;
}

// Main execution
if (import.meta.main) {
  const eventType = process.argv[2];
  
  if (eventType) {
    await handleHookEvent(eventType);
  } else {
    await logger.error('No event type provided');
    process.exit(1);
  }
}