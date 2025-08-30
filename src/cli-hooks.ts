#!/usr/bin/env bun
/**
 * CLI Hooks - Claude Code hook event handling
 * 
 * Processes Claude Code hook events and manages diagnostic workflows
 * using the clean diagnostic processing and server manager.
 */

import { dirname } from "path";
import { 
  safeDeleteFile,
  secureHash 
} from "./utils/security";
import { logger } from "./utils/logger";
import { TIMEOUTS } from "./constants";
import { 
  runDiagnostics, 
  findProjectRoot,
  findAllProjects,
  filterAndProcessDiagnostics
} from "./cli-diagnostics";
import { ensureServerRunning } from "./cli-server-manager";

/**
 * Handle hook event from Claude Code
 * Returns true if errors were found, false otherwise
 */
export async function handleHookEvent(eventType: string): Promise<boolean> {
  try {
    const input = await Bun.stdin.text();
    
    // Handle empty input gracefully
    if (!input || input.trim() === '') {
      await logger.debug('Hook received empty input', { eventType });
      return false;
    }
    
    let hookData: any;
    try {
      hookData = JSON.parse(input);
    } catch (parseError) {
      await logger.error('Failed to parse hook input as JSON', parseError, { 
        eventType, 
        inputLength: input.length,
        inputPreview: input.substring(0, 100) 
      });
      return false;
    }
    
    // Deduplication: Generate unique ID for this hook event
    const hookId = `${eventType}-${hookData?.session_id || hookData?.sessionId || 'unknown'}-${Date.now()}`;
    const dedupFile = `/tmp/claude-lsp-hook-${secureHash(hookId).substring(0, 8)}.lock`;
    
    // Check if this exact hook was recently processed (within 2 seconds)
    try {
      const lockStat = await Bun.file(dedupFile).exists();
      if (lockStat) {
        const lockTime = await Bun.file(dedupFile).text();
        const lockTimestamp = parseInt(lockTime);
        if (Date.now() - lockTimestamp < 2000) {
          // Skip duplicate hook event
          await logger.debug('Skipping duplicate hook event', { eventType, hookId });
          return false;
        }
      }
    } catch (error) {
      // Lock file doesn't exist or can't be read, continue
    }
    
    // Create lock file to prevent duplicates
    await Bun.write(dedupFile, Date.now().toString());
    
    // Clean up lock file after 2 seconds
    setTimeout(async () => {
      await safeDeleteFile(dedupFile);
    }, 2000);
    
    // Process based on event type
    if (eventType === 'PostToolUse') {
      return await handlePostToolUse(hookData);
    } else if (eventType === 'Stop') {
      return await handleStop(hookData);
    }
    
    // Return false for all other event types (no errors to report)
    return false;
    
  } catch (error) {
    await logger.error('Hook event processing failed', error);
    return false; // Error in hook itself, not in code
  }
}

/**
 * Handle PostToolUse hook events
 */
async function handlePostToolUse(hookData: any): Promise<boolean> {
  await logger.debug('Hook data received:', hookData);
  
  // Check if this is a file-specific tool (Edit, Write, MultiEdit, etc.)
  // Support both 'tool' and 'toolName' fields for compatibility
  const toolName = hookData?.toolName || hookData?.tool;
  const fileSpecificTool = toolName && ['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(toolName);
  // Also check output for file_path (tests use this structure)
  const targetFile = hookData?.input?.file_path || hookData?.input?.input_path || hookData?.input?.path || hookData?.output?.file_path;
  
  // Determine current project root early
  let currentProjectRoot: string | null = null;
  if (fileSpecificTool && targetFile) {
    currentProjectRoot = await findProjectRoot(targetFile);
  }
  if (!currentProjectRoot) {
    // Fall back to working directory
    const baseDir = hookData?.cwd || hookData?.workingDirectory || process.cwd();
    const projects = await findAllProjects(baseDir);
    if (projects.length > 0) {
      currentProjectRoot = projects[0];
    }
  }
  
  // First, check for any pending file checks from previous hooks
  await processPendingFileChecks(currentProjectRoot || undefined);
  
  // Handle file-specific diagnostics
  if (fileSpecificTool && targetFile) {
    return await handleFileSpecificTool(targetFile, currentProjectRoot);
  }
  
  // Run diagnostics after ANY tool - files could be modified externally
  const baseDir = hookData?.cwd || hookData?.workingDirectory || process.cwd();
  const projects = await findAllProjects(baseDir);
  const projectRoots = projects.length > 0 ? projects : [baseDir];
  
  if (projectRoots.length > 0) {
    return await runProjectDiagnostics(projectRoots);
  }
  
  return false; // No project root found
}

/**
 * Handle file-specific tool operations
 */
async function handleFileSpecificTool(targetFile: string, currentProjectRoot: string | null): Promise<boolean> {
  await logger.debug('File-specific tool detected', { file: targetFile });
  
  const fileProjectRoot = currentProjectRoot || await findProjectRoot(targetFile);
  if (!fileProjectRoot) {
    await logger.debug('No project root found for file', { file: targetFile });
    return false;
  }
  
  // ALWAYS store the file as pending first
  await storePendingFileCheck(targetFile, fileProjectRoot);
  
  // Store file modification info
  await storeFileModificationInfo(targetFile);
  
  // Ensure LSP server is started (but don't wait long)
  const serverRunning = await isServerQuickCheck(fileProjectRoot);
  
  // Start server in background if not running
  if (!serverRunning) {
    // Start server asynchronously - don't wait
    ensureServerRunning(fileProjectRoot).catch(err => 
      logger.error('Background LSP server start failed', { error: err })
    );
    await logger.info('LSP server starting in background for project', { project: fileProjectRoot });
  }
  
  // Don't process pending checks here - let the next hook trigger handle it
  return false; // Diagnostics will appear on next hook trigger
}

/**
 * Run diagnostics for multiple projects
 */
async function runProjectDiagnostics(projectRoots: string[]): Promise<boolean> {
  await logger.debug('Found project roots', { count: projectRoots.length, roots: projectRoots });
  await logger.debug('Calling runDiagnostics');
  
  let diagnostics;
  let serverResponse: any = null;
  
  try {
    // In test mode, use a longer timeout and better error handling
    const timeout = process.env.CLAUDE_LSP_HOOK_MODE === 'true' ? TIMEOUTS.HOOK_TIMEOUT_MS : TIMEOUTS.DIAGNOSTIC_TIMEOUT_MS;
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('runDiagnostics timeout')), timeout)
    );
    
    // Run diagnostics for all projects
    const allDiagnostics = [];
    for (const projectRoot of projectRoots) {
      const projectDiags = await Promise.race([
        runDiagnostics(projectRoot),
        timeoutPromise
      ]);
      
      if (projectDiags) {
        serverResponse = projectDiags; // Keep the full response for summary access
        allDiagnostics.push(...(projectDiags.diagnostics || []));
      }
    }
    diagnostics = allDiagnostics;
  } catch (error) {
    await logger.debug('runDiagnostics error', { error });
    await logger.error('Failed to run diagnostics', { 
      error: error instanceof Error ? error.message : String(error), 
      projectRoots 
    });
    
    // In test/hook mode, diagnostics might fail if LSP server isn't running
    await logger.debug('Diagnostics failed, no fallback available');
    diagnostics = [];
  }
  
  await logger.debug('Raw diagnostics count', { count: diagnostics.length || 0 });
  await logger.debug("Diagnostics response received", diagnostics);
  
  // Use first project root as context for deduplication and filtering
  const currentProjectRoot = projectRoots[0];
  
  // Output diagnostics as system message
  if (diagnostics && diagnostics.length > 0) {
    // Filter out ignored files (node_modules, .git, etc.)
    const filteredDiagnostics = await filterAndProcessDiagnostics(diagnostics, currentProjectRoot);
    
    if (filteredDiagnostics.length === 0) {
      // All diagnostics were in node_modules, ignore
      return false;
    }
    
    // Count issues by severity (from filtered diagnostics)
    const errors = filteredDiagnostics.filter((d: any) => d.severity === 'error').length;
    const warnings = filteredDiagnostics.filter((d: any) => d.severity === 'warning').length;
    
    // Only report errors and warnings, not hints (too noisy)
    await logger.debug(`DECISION POINT: errors=${errors}, warnings=${warnings}`);
    if (errors > 0 || warnings > 0) {
      await logger.debug('ENTERING: errors > 0 || warnings > 0 block');
      
      // Show compact summary for users
      if (errors > 0) {
        await logger.error(`❌ ${errors} error${errors > 1 ? 's' : ''} found\n`);
      } else if (warnings > 0) {
        await logger.error(`⚠️  ${warnings} warning${warnings > 1 ? 's' : ''} found\n`);
      }
      
      // Only send message if server response has a summary
      if (serverResponse) {
        // Display server response as-is (server includes [[system-message]]: prefix)
        console.error(serverResponse);
        return true; // Any message sent to user - exit with code 2 for feedback
      } else {
        return false; // No response to display
      }
    } else {
      // Only hints - don't report to avoid noise
      return false;
    }
  } else {
    await logger.info("No diagnostic issues found");
    return false; // No errors - stay silent
  }
}

/**
 * Handle Stop hook events
 */
async function handleStop(hookData: any): Promise<boolean> {
  // Clean shutdown - stop LSP servers for this session
  const workDir = hookData?.cwd || hookData?.workingDirectory || process.cwd();
  if (workDir) {
    const projectRoot = workDir;
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
  
  return false;
}

/**
 * Quick check if server is running (50ms max)
 */
async function isServerQuickCheck(projectRoot: string): Promise<boolean> {
  const projectHash = secureHash(projectRoot).substring(0, 16);
  
  // Use same socket directory as server
  const socketDir = process.env.XDG_RUNTIME_DIR || 
                   (process.platform === 'darwin' 
                     ? `${process.env.HOME}/Library/Application Support/claude-lsp/run`
                     : `${process.env.HOME}/.claude-lsp/run`);
  const socketPath = `${socketDir}/claude-lsp-${projectHash}.sock`;
  
  try {
    const healthCheck = await Promise.race([
      fetch('http://localhost/health', { unix: socketPath } as any),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 50))
    ]);
    return (healthCheck as Response).ok;
  } catch {
    return false;
  }
}

/**
 * Process any pending file checks from previous hooks
 */
async function processPendingFileChecks(currentProjectRoot?: string): Promise<void> {
  try {
    // Claude Code likely kills hooks after ~5 seconds, so we need to be fast
    // Use only 500ms for pending checks to leave room for the main work
    const timeout = 500; // 500ms max for pending checks
    const startTime = Date.now();
    
    const { DiagnosticDeduplicator } = await import("./utils/diagnostic-dedup");
    // Use current project root if available, otherwise cwd
    const dedup = new DiagnosticDeduplicator(currentProjectRoot || process.cwd());
    
    try {
      // Check if table exists
      const tableExists = dedup.db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='pending_file_checks'
      `).get();
      
      if (!tableExists) {
        return; // No pending checks
      }
      
      // Get ALL pending checks for efficiency - we'll process them by project
      let pendingChecks: Array<{ file_path: string; project_root: string; created_at?: string }> = [];
      
      if (currentProjectRoot) {
        // Get ALL pending checks for current project
        const currentProjectChecks = dedup.db.prepare(`
          SELECT file_path, project_root 
          FROM pending_file_checks 
          WHERE checked = 0 
          AND project_root = ?
          ORDER BY created_at DESC
        `).all(currentProjectRoot) as Array<{ file_path: string; project_root: string }>;
        
        pendingChecks.push(...currentProjectChecks);
      }
      
      // Also get some from other projects to prevent starvation
      const otherProjectChecks = dedup.db.prepare(`
        SELECT file_full_path, file_path, project_root, created_at
        FROM pending_file_checks 
        WHERE checked = 0 
        ${currentProjectRoot ? 'AND project_root != ?' : ''}
        ORDER BY created_at ASC
        LIMIT 10
      `).all(...(currentProjectRoot ? [currentProjectRoot] : [])) as Array<{ file_full_path: string; file_path: string; project_root: string; created_at: string }>;
      
      // Add other project checks and mark expired ones
      for (const check of otherProjectChecks) {
        const createdAt = new Date(check.created_at).getTime();
        const now = Date.now();
        if (now - createdAt > 5 * 60 * 1000) {
          // Too old, mark as expired
          await logger.warn('Pending check too old, marking as expired', { 
            file: check.file_path, 
            age: Math.floor((now - createdAt) / 1000) + 's' 
          });
          dedup.db.prepare(`
            UPDATE pending_file_checks 
            SET checked = 1 
            WHERE file_full_path = ?
          `).run(check.file_full_path);
        } else {
          pendingChecks.push(check);
        }
      }
      
      if (pendingChecks.length === 0) {
        return; // No pending checks
      }
      
      await logger.debug('Found pending file checks', { count: pendingChecks.length });
      
      // Group pending checks by project
      const pendingByProject = new Map<string, Array<{ file_path: string; project_root: string }>>();
      for (const pending of pendingChecks) {
        if (!pendingByProject.has(pending.project_root)) {
          pendingByProject.set(pending.project_root, []);
        }
        pendingByProject.get(pending.project_root)!.push(pending);
      }
      
      // Process each project's pending files
      for (const [projectRoot, projectPendings] of pendingByProject) {
        const elapsed = Date.now() - startTime;
        if (elapsed > timeout) {
          break; // Out of time
        }
        
        // Check if LSP server is now running for this project
        const serverReady = await isServerQuickCheck(projectRoot);
        
        if (!serverReady) {
          // Server not ready, try to start it in background
          ensureServerRunning(projectRoot).catch(err => 
            logger.error('Background LSP server start failed', { error: err })
          );
          continue; // Skip this project for now
        }
        
        // Server is running, get diagnostics for the whole project once
        const remainingTime = timeout - (Date.now() - startTime);
        if (remainingTime < 100) {
          break; // Not enough time left
        }
        
        try {
          const diagnostics = await Promise.race([
            runDiagnostics(projectRoot),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), Math.min(remainingTime, 400)))
          ]) as any;
          
          if (diagnostics && diagnostics.diagnostics) {
            // Get all pending file paths for this project
            const pendingFilePaths = new Set(projectPendings.map(p => p.file_path));
            
            // Filter to only pending files from this project
            const pendingFileDiagnostics = diagnostics.diagnostics.filter((d: any) => 
              pendingFilePaths.has(d.file)
            );
            
            if (pendingFileDiagnostics.length > 0) {
              // Use server response instead of manual processing
              if (diagnostics) {
                console.error(diagnostics); // Display server response as-is
                
                // Mark all files we found diagnostics for as checked
                for (const pending of projectPendings) {
                  if (pendingFilePaths.has(pending.file_path)) {
                    dedup.db.prepare(`
                      UPDATE pending_file_checks 
                      SET checked = 1 
                      WHERE file_full_path = ?
                    `).run(pending.file_path);
                  }
                }
              }
              
              // We reported diagnostics for this project, that's enough for this hook
              break;
            } else {
              // No diagnostics for these files, mark them as checked
              for (const pending of projectPendings) {
                dedup.db.prepare(`
                  UPDATE pending_file_checks 
                  SET checked = 1 
                  WHERE file_full_path = ?
                `).run(pending.file_path);
              }
            }
          }
        } catch (error) {
          // Timeout or error, move on to next project
          await logger.debug('Failed to get diagnostics for project', { project: projectRoot, error });
        }
      }
      
      // Clean up old checked entries (older than 1 hour)
      dedup.db.prepare(`
        DELETE FROM pending_file_checks 
        WHERE checked = 1 
        AND datetime(created_at) < datetime('now', '-1 hour')
      `).run();
      
    } finally {
      dedup.close();
    }
  } catch (error) {
    await logger.error('Failed to process pending file checks', { error });
  }
}

/**
 * Store a pending file check for later processing
 */
async function storePendingFileCheck(filePath: string, projectRoot: string): Promise<void> {
  try {
    const { DiagnosticDeduplicator } = await import("./utils/diagnostic-dedup");
    const dedup = new DiagnosticDeduplicator(projectRoot);
    
    try {
      // Create table if it doesn't exist
      dedup.db.exec(`
        CREATE TABLE IF NOT EXISTS pending_file_checks (
          file_full_path TEXT PRIMARY KEY,  -- Unique absolute path
          file_path TEXT NOT NULL,          -- Relative path for display  
          project_root TEXT NOT NULL,       -- Project context
          created_at TEXT NOT NULL,
          checked BOOLEAN DEFAULT 0
        )
      `);
      
      // Store pending check  
      const relativePath = filePath.replace(projectRoot + '/', '');
      const query = dedup.db.prepare(`
        INSERT OR REPLACE INTO pending_file_checks (
          file_full_path,
          file_path, 
          project_root,
          created_at,
          checked
        ) VALUES (?, ?, ?, ?, 0)
      `);
      
      query.run(
        filePath,          // full path as primary key
        relativePath,      // relative path for display
        projectRoot,
        new Date().toISOString()
      );
      
      await logger.debug('Stored pending file check', { filePath, projectRoot });
    } finally {
      dedup.close();
    }
  } catch (error) {
    await logger.error('Failed to store pending file check', { error, filePath });
  }
}

/**
 * Store file modification info without dedup checking
 */
async function storeFileModificationInfo(filePath: string): Promise<void> {
  try {
    const stats = await Bun.file(filePath).exists() ? 
      await import("fs").then(fs => fs.promises.stat(filePath)) : null;
    
    if (!stats) {
      await logger.debug('File does not exist', { filePath });
      return;
    }
    
    const { DiagnosticDeduplicator } = await import("./utils/diagnostic-dedup");
    const projectRoot = await findProjectRoot(filePath) || dirname(filePath);
    const dedup = new DiagnosticDeduplicator(projectRoot);
    
    try {
      // Create table if it doesn't exist
      dedup.db.exec(`
        CREATE TABLE IF NOT EXISTS file_modifications (
          file_path TEXT PRIMARY KEY,
          last_modified TEXT NOT NULL,
          last_checked TEXT NOT NULL
        )
      `);
      
      // Store file info directly without checking for duplicates
      const query = dedup.db.prepare(`
        INSERT OR REPLACE INTO file_modifications (
          file_path, 
          last_modified, 
          last_checked
        ) VALUES (?, ?, ?)
      `);
      
      query.run(
        filePath,
        stats.mtime.toISOString(),
        new Date().toISOString()
      );
      
      await logger.debug('Stored file modification info', { 
        filePath, 
        lastModified: stats.mtime.toISOString() 
      });
    } finally {
      dedup.close();
    }
  } catch (error) {
    await logger.error('Failed to store file modification info', { error, filePath });
  }
}

// Main execution
if (import.meta.main) {
  const eventType = process.argv[2];
  
  if (eventType) {
    const hasErrors = await handleHookEvent(eventType);
    // Exit with appropriate code based on errors found
    if (eventType === 'PostToolUse' && hasErrors) {
      process.exit(2); // Show feedback - triggers Claude to respond faster
    } else {
      process.exit(0); // Success
    }
  } else {
    await logger.error('No event type provided');
    process.exit(1);
  }
}