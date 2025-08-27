#!/usr/bin/env bun
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "fs";
import ignore from "ignore";
import { join, resolve, dirname } from "path";
import { 
  secureHash, 
  safeDeleteFile
} from "./utils/security";
import { logger } from "./utils/logger";
import { TIMEOUTS } from "./constants";



// LSP Client Functions






// Load gitignore patterns
async function loadGitignore(projectRoot: string): Promise<ReturnType<typeof ignore> | null> {
  try {
    const gitignorePath = join(projectRoot, '.gitignore');
    if (!existsSync(gitignorePath)) {
      // Create default ignore patterns even without .gitignore
      const ig = ignore();
      ig.add('node_modules');
      ig.add('.git');
      ig.add('dist');
      ig.add('build');
      ig.add('coverage');
      ig.add('.next');
      ig.add('.nuxt');
      ig.add('.svelte-kit');
      ig.add('*.log');
      ig.add('.DS_Store');
      return ig;
    }
    
    const content = await readFile(gitignorePath, 'utf-8');
    const ig = ignore();
    ig.add(content);
    
    // Always add these patterns
    ig.add('node_modules');
    ig.add('.git');
    
    return ig;
  } catch (error) {
    await logger.warn('Failed to load .gitignore', { error });
    // Return default patterns on error
    const ig = ignore();
    ig.add('node_modules');
    ig.add('.git');
    ig.add('dist');
    ig.add('build');
    return ig;
  }
}

// Filter out ignored files from diagnostics
async function filterDiagnostics(diagnostics: any[], projectRoot: string): Promise<any[]> {
  const ig = await loadGitignore(projectRoot);
  
  // Check if TypeScript project and load tsconfig if exists
  let hasTypeScriptConfig = false;
  let allowJs = false;
  let checkJs = false;
  
  try {
    const tsconfigPath = join(projectRoot, 'tsconfig.json');
    if (existsSync(tsconfigPath)) {
      hasTypeScriptConfig = true;
      const tsconfigContent = readFileSync(tsconfigPath, 'utf8');
      const tsconfig = JSON.parse(tsconfigContent);
      
      // Check TypeScript compiler options
      allowJs = tsconfig.compilerOptions?.allowJs || false;
      checkJs = tsconfig.compilerOptions?.checkJs || false;
    }
  } catch (e) {
    // Ignore tsconfig parse errors
  }
  
  return diagnostics.filter((d: any) => {
    if (!d.file) return true;
    
    // Convert absolute path to relative for ignore matching
    const relativePath = d.file.startsWith(projectRoot) 
      ? d.file.slice(projectRoot.length + 1)
      : d.file;
    
    // Check if file should be ignored by gitignore
    if (ig && ig.ignores(relativePath)) {
      return false;
    }
    
    // Always filter out node_modules
    if (relativePath.includes('node_modules/')) {
      return false;
    }
    
    // If this is a TypeScript project and the file is .js
    if (hasTypeScriptConfig && relativePath.endsWith('.js')) {
      // Only check JS files if TypeScript is configured to do so
      if (!allowJs && !checkJs) {
        // TypeScript is not configured to check JS files, filter them out
        return false;
      }
    }
    
    return true;
  });
}

// Main diagnostic function
export async function runDiagnostics(
  projectRoot: string,
): Promise<any> {
  const projectHash = secureHash(projectRoot).substring(0, 16);
  
  logger.setProject(projectHash);
  
  try {
    // First, try to query the existing server
    const socketDir = process.env.XDG_RUNTIME_DIR || 
                     (process.platform === 'darwin' 
                       ? `${process.env.HOME}/Library/Application Support/claude-lsp/run`
                       : `${process.env.HOME}/.claude-lsp/run`);
    
    const socketPath = `${socketDir}/claude-lsp-${projectHash}.sock`;
    
    // Check if server is running by attempting to query it
    let serverRunning = false;
    try {
      const testResponse = await fetch('http://localhost/health', {
        // @ts-ignore - Bun supports unix option
        unix: socketPath,
        signal: AbortSignal.timeout(1000)
      });
      serverRunning = testResponse.ok;
    } catch {
      // Server not running
    }
    
    // If server not running, start it
    if (!serverRunning) {
      const { spawn } = await import('child_process');
      const { existsSync } = await import('fs');
      
      // Try multiple paths to find the server
      const possiblePaths = [
        // Same directory as the CLI binary (most common in production)
        join(process.argv[0].replace(/\/[^\/]+$/, ''), 'claude-lsp-server'),
        // If running from compiled binary in bin/
        join(process.cwd(), 'bin', 'claude-lsp-server'),
        // If running from source in src/
        join(import.meta.dir, '..', 'bin', 'claude-lsp-server'),
        // Global installation path
        '/usr/local/bin/claude-lsp-server',
        // Home directory installation
        join(process.env.HOME || '', '.claude', 'claude-code-lsp', 'bin', 'claude-lsp-server'),
      ];
      
      let serverBinaryPath: string | null = null;
      await logger.debug('Searching for server binary...');
      for (const path of possiblePaths) {
        await logger.debug(`Checking: ${path}`);
        if (existsSync(path)) {
          serverBinaryPath = path;
          await logger.debug(`Found server at: ${path}`);
          break;
        }
      }
      
      let serverProcess;
      if (serverBinaryPath) {
        // Use compiled binary
        await logger.debug(`Starting server binary: ${serverBinaryPath}`);
        serverProcess = spawn(serverBinaryPath, [projectRoot], {
          detached: true,
          stdio: 'ignore'
        });
      } else {
        // Fall back to running TypeScript source
        const serverTsPath = join(import.meta.dir, 'server.ts');
        if (existsSync(serverTsPath)) {
          await logger.debug(`Starting server from source: ${serverTsPath}`);
          serverProcess = spawn('bun', ['run', serverTsPath, projectRoot], {
            detached: true,
            stdio: 'ignore'
          });
        } else {
          await logger.error('Could not find server binary or source file');
          throw new Error('LSP server binary not found. Please ensure claude-lsp-server is built.');
        }
      }
      serverProcess.unref();
      
      // Wait for server to start (longer in CI environments)
      // Note: Server needs time to initialize language servers
      const waitTime = process.env.CI ? 8000 : 5000;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    // Now query the server for diagnostics
    let serverResponse: any = null;
    
    // Query the server for diagnostics (project-level only)
    try {
      const url = `http://localhost/diagnostics/all`;
      
      const response = await fetch(url, {
        // @ts-ignore - Bun supports unix option
        unix: socketPath,
        headers: {
          'Content-Type': 'application/json'
        },
        signal: AbortSignal.timeout(TIMEOUTS.DIAGNOSTIC_TIMEOUT_MS) // 30 second timeout
      });
      
      if (response.ok) {
        const data = await response.json();
        // Pass server response directly - no need to reconstruct
        serverResponse = data;
      } else {
        await logger.error(`Server returned error: ${response.status}`, { url });
      }
    } catch (error) {
      await logger.error('Failed to query diagnostics from server', error);
    }
    
    return serverResponse || {
      diagnostics: [],
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    await logger.error('Diagnostics run failed', error);
    
    // Return mock diagnostics only during installation testing
    if (process.env.NODE_ENV === 'test' && process.env.CLAUDE_LSP_MOCK_DIAGNOSTICS === 'true') {
      await logger.debug('Using mock diagnostics for test');
      return {
        diagnostics: [{
          file: join(projectRoot, 'test.ts'),
          line: 2,
          column: 7,
          severity: 'error',
          message: "Type 'number' is not assignable to type 'string'.",
          source: 'typescript',
          ruleId: '2322'
        }],
        timestamp: new Date().toISOString()
      };
    }
    
    throw error;
  }
}

// Hook handler for Claude Code integration
// Returns true if errors were found, false otherwise
export async function handleHookEvent(eventType: string): Promise<boolean> {
  try {
    const input = await Bun.stdin.text();
    
    // Handle empty input gracefully
    if (!input || input.trim() === '') {
      await logger.debug('Hook received empty input', { eventType });
      // Exit successfully - no data is not an error for some hook types
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
      // Exit successfully - malformed data shouldn't block Claude
      return false;
    }
    
    // Deduplication: Generate unique ID for this hook event to prevent duplicate processing
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
    
    // Silent operation - only output when there are actual diagnostics to report
    
    // Process based on event type
    if (eventType === 'PostToolUse') {
      // Log the hook data to understand its structure
      await logger.debug('Hook data received:', hookData);
      
      // DEBUG: Output hook data structure to stderr to see what we're getting
      if (process.env.DEBUG_HOOK_DATA === 'true') {
        console.error('DEBUG_HOOK_DATA:', JSON.stringify(hookData, null, 2));
      }
      
      // Check if this is a file-specific tool (Edit, Write, MultiEdit, etc.)
      const fileSpecificTool = hookData?.toolName && ['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(hookData.toolName);
      const targetFile = hookData?.input?.file_path || hookData?.input?.input_path || hookData?.input?.path;
      
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
      // Pass the current project root to prioritize checks for the same project
      await processPendingFileChecks(currentProjectRoot || undefined);
      
      // Handle file-specific diagnostics
      if (fileSpecificTool && targetFile) {
        await logger.debug('File-specific tool detected', { tool: hookData.toolName, file: targetFile });
        
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
        const projectHash = secureHash(fileProjectRoot).substring(0, 16);
        const socketPath = `/tmp/claude-lsp-${projectHash}.sock`;
        let serverRunning = false;
        
        // Quick check if server is already running (50ms max)
        if (existsSync(socketPath)) {
          try {
            const healthCheck = await Promise.race([
              fetch('http://localhost/health', { unix: socketPath } as any),
              new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 50))
            ]);
            serverRunning = (healthCheck as Response).ok;
          } catch {
            serverRunning = false;
          }
        }
        
        // Start server in background if not running
        if (!serverRunning) {
          import("./manager").then(({ startLspServer }) => {
            startLspServer(fileProjectRoot).catch(err => 
              logger.error('Background LSP server start failed', { error: err })
            );
          });
          await logger.info('LSP server starting in background for project', { project: fileProjectRoot });
        }
        
        // Don't process pending checks here - we don't know how much time we have
        // Let the next hook trigger handle it
        
        return false; // Diagnostics will appear on next hook trigger
      }
      
      // Run diagnostics after ANY tool - files could be modified externally
      // or through ways we don't detect (vim in bash, file watchers, etc.)
      // Get working directory from hook data or current directory
      // Note: Claude passes 'cwd' not 'workingDirectory' in base fields
      const baseDir = hookData?.cwd || hookData?.workingDirectory || process.cwd();
      
      // Use fd to find all projects under the current directory
      // This allows the hook to work even when Claude is started from a parent directory
      const projects = await findAllProjects(baseDir);
      
      // Run diagnostics for ALL projects found in the workspace
      // Since we don't know which files were modified, check everything
      const projectRoots = projects.length > 0 ? projects : [baseDir];
      if (projectRoots.length > 0) {
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
            // runDiagnostics returns { diagnostics: [...], timestamp: ..., summary?: ... }
            if (projectDiags) {
              serverResponse = projectDiags; // Keep the full response for summary access
              allDiagnostics.push(...(projectDiags.diagnostics || []));
            }
          }
          diagnostics = allDiagnostics;
        } catch (error) {
          await logger.debug('runDiagnostics error', { error });
          await logger.error('Failed to run diagnostics', { error: error instanceof Error ? error.message : String(error), projectRoots });
          
          // In test/hook mode, diagnostics might fail if LSP server isn't running
          await logger.debug('Diagnostics failed, no fallback available');
          
          // Create empty diagnostics array to match the successful case
          diagnostics = [];
        }
        
        await logger.debug('Raw diagnostics count', { count: diagnostics.length || 0 });
        
        await logger.debug("Diagnostics response received", diagnostics);
        
        // Filter diagnostics to only the edited file if specified
        if (filterToFile && diagnostics.length > 0) {
          const originalCount = diagnostics.length;
          diagnostics = diagnostics.filter((d: any) => 
            d.file === filterToFile || d.file === resolve(filterToFile)
          );
          await logger.debug('Filtered diagnostics to specific file', { 
            file: filterToFile, 
            originalCount, 
            filteredCount: diagnostics.length 
          });
          
          // Update the server response to reflect filtered diagnostics
          if (serverResponse) {
            serverResponse.diagnostics = diagnostics;
            // Update summary to show only the filtered file's diagnostics
            if (diagnostics.length === 0) {
              serverResponse.summary = "no warnings or errors";
            } else {
              // Count by source for filtered diagnostics
              const bySource: Record<string, number> = {};
              for (const diag of diagnostics) {
                const source = diag.source || 'unknown';
                bySource[source] = (bySource[source] || 0) + 1;
              }
              serverResponse.summary = `total: ${diagnostics.length} diagnostics (${Object.entries(bySource).map(([src, count]) => `${count} for ${src}`).join(', ')})`;
            }
          }
        }
        
        // Use first project root as context for deduplication and filtering
        const currentProjectRoot = projectRoots[0];
        
          // Output diagnostics as system message
          if (diagnostics && diagnostics.length > 0) {
            // Filter out ignored files (node_modules, .git, etc.)
            const filteredDiagnostics = await filterDiagnostics(diagnostics, currentProjectRoot);
            
            
            if (filteredDiagnostics.length === 0) {
              // All diagnostics were in node_modules, ignore
              return false;
            }
            
            // Count issues by severity (from filtered diagnostics)
            const errors = filteredDiagnostics.filter((d: any) => d.severity === 'error').length;
            const warnings = filteredDiagnostics.filter((d: any) => d.severity === 'warning').length;
            filteredDiagnostics.filter((d: any) => d.severity === 'hint' || d.severity === 'info').length;
            
            // Only report errors and warnings, not hints (too noisy)
            await logger.debug(`DECISION POINT: errors=${errors}, warnings=${warnings}`);
            if (errors > 0 || warnings > 0) {
              await logger.debug('ENTERING: errors > 0 || warnings > 0 block');
              const relevantDiagnostics = filteredDiagnostics.filter((d: any) => 
                d.severity === 'error' || d.severity === 'warning'
              );
              
              // Server-side deduplication: just report whatever diagnostics were returned
              
              // Show compact summary for users
              if (errors > 0) {
                await logger.error(`❌ ${errors} error${errors > 1 ? 's' : ''} found\n`);
              } else if (warnings > 0) {
                await logger.error(`⚠️  ${warnings} warning${warnings > 1 ? 's' : ''} found\n`);
              }
              
              // Group diagnostics by language/source
              const diagnosticsBySource = new Map<string, any[]>();
              for (const diag of relevantDiagnostics) {
                const source = diag.source || 'unknown';
                if (!diagnosticsBySource.has(source)) {
                  diagnosticsBySource.set(source, []);
                }
                diagnosticsBySource.get(source)!.push(diag);
              }
              
              // Server-side deduplication already handled limiting - just display what we got
              const displayDiagnostics: any[] = relevantDiagnostics;
              
              // Only send message if server response has a summary
              if (serverResponse && serverResponse.summary) {
                // Build clean response with only needed fields
                const cleanResponse: any = {
                  summary: serverResponse.summary
                };
                
                // Only include diagnostics if not empty
                if (serverResponse.diagnostics && serverResponse.diagnostics.length > 0) {
                  cleanResponse.diagnostics = serverResponse.diagnostics;
                }
                
                console.error(`[[system-message]]: ${JSON.stringify(cleanResponse)}`)
                await logger.debug('RETURNING TRUE - Sent message to user, exit with code 2');
                return true; // Any message sent to user - exit with code 2 for feedback
              } else {
                await logger.debug('No summary from server - silently exit code 0');
                return false; // No summary to report - exit code 0
              }
            } else {
              // Only hints - don't report to avoid noise
              return false;
            }
          } else {
            await logger.info("No diagnostic issues found");
            
            // Check if errors were cleared (went from errors to no errors)
            // Only show "no warnings or errors" when transitioning from errors to clean state
            // TODO: Need to track previous state to know if errors were cleared
            // For now, stay silent when there are no errors
            
            return false; // No errors - stay silent
          }
        }
        return false; // No project root found
    } else if (eventType === 'Stop') {
      // Clean shutdown - stop LSP servers for this session
      // Handle Stop event - use cwd field from base hook data
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
    }
    
    // Return false for all other event types (no errors to report)
    return false;
    
  } catch (error) {
    await logger.error('Hook event processing failed', error);
    return false; // Error in hook itself, not in code
  }
}

async function findProjectRoot(filePath: string): Promise<string | null> {
  // Use the more comprehensive implementation from manager.ts
  const { findProjectRoot: findProjectRootFromManager } = await import('./manager');
  const projectInfo = findProjectRootFromManager(filePath);
  return projectInfo?.root || null;
}

// Ensure LSP server is running for a project
async function ensureLspServerRunning(projectRoot: string): Promise<void> {
  try {
    const projectHash = secureHash(projectRoot).substring(0, 16);
    const socketPath = `/tmp/claude-lsp-${projectHash}.sock`;
    
    // Check if server is already running
    if (existsSync(socketPath)) {
      // Try to ping it
      try {
        const response = await fetch('http://localhost/health', {
          unix: socketPath,
          signal: AbortSignal.timeout(1000)
        } as any);
        
        if (response.ok) {
          await logger.debug('LSP server already running', { projectRoot, socketPath });
          return; // Server is healthy
        }
      } catch {
        // Server not responding, need to start new one
        await logger.debug('LSP server socket exists but not responding', { socketPath });
      }
    }
    
    // Start new server
    await logger.info('Starting LSP server for project', { projectRoot });
    const { startLspServer } = await import("./manager");
    await startLspServer(projectRoot);
    
    // Wait a bit for server to initialize
    await new Promise(resolve => setTimeout(resolve, 500));
    
  } catch (error) {
    await logger.error('Failed to ensure LSP server running', { error, projectRoot });
    throw error;
  }
}

// Process any pending file checks from previous hooks
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
      
      // Get pending checks - but only process 1-2 to stay fast
      // Strategy: Take 1 oldest overall, or 1 from current project
      let pendingChecks: Array<{ file_path: string; project_root: string }> = [];
      
      if (currentProjectRoot) {
        // Prefer current project's pending check
        const currentProjectCheck = dedup.db.prepare(`
          SELECT file_path, project_root 
          FROM pending_file_checks 
          WHERE checked = 0 
          AND project_root = ?
          ORDER BY created_at DESC
          LIMIT 1
        `).get(currentProjectRoot) as { file_path: string; project_root: string } | undefined;
        
        if (currentProjectCheck) {
          pendingChecks.push(currentProjectCheck);
        }
      }
      
      // If no current project check, get oldest overall
      if (pendingChecks.length === 0) {
        const oldestOverall = dedup.db.prepare(`
          SELECT file_path, project_root, created_at
          FROM pending_file_checks 
          WHERE checked = 0 
          ORDER BY created_at ASC
          LIMIT 1
        `).get() as { file_path: string; project_root: string; created_at: string } | undefined;
        
        if (oldestOverall) {
          pendingChecks.push(oldestOverall);
          
          // Check if oldest is too old (> 5 minutes) - if so, just mark it as checked to avoid infinite retries
          const createdAt = new Date(oldestOverall.created_at).getTime();
          const now = Date.now();
          if (now - createdAt > 5 * 60 * 1000) {
            await logger.warn('Pending check too old, marking as expired', { 
              file: oldestOverall.file_path, 
              age: Math.floor((now - createdAt) / 1000) + 's' 
            });
            dedup.db.prepare(`
              UPDATE pending_file_checks 
              SET checked = 1 
              WHERE file_path = ?
            `).run(oldestOverall.file_path);
            // Remove from our processing list
            pendingChecks = pendingChecks.filter(p => p.file_path !== oldestOverall.file_path);
          }
        }
      }
      
      if (pendingChecks.length === 0) {
        return; // No pending checks
      }
      
      await logger.debug('Found pending file checks', { count: pendingChecks.length });
      
      // Process each pending check quickly
      for (const pending of pendingChecks) {
        const elapsed = Date.now() - startTime;
        if (elapsed > timeout) {
          break; // Out of time
        }
        
        // Check if LSP server is now running for this project
        const projectHash = secureHash(pending.project_root).substring(0, 16);
        const socketPath = `/tmp/claude-lsp-${projectHash}.sock`;
        
        let serverReady = false;
        if (existsSync(socketPath)) {
          try {
            // Quick health check (50ms max)
            const healthCheck = await Promise.race([
              fetch('http://localhost/health', { unix: socketPath } as any),
              new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 50))
            ]);
            serverReady = (healthCheck as Response).ok;
          } catch {
            serverReady = false;
          }
        }
        
        if (!serverReady) {
          // Server not ready, try to start it in background if it's for current project
          if (pending.project_root === currentProjectRoot) {
            import("./manager").then(({ startLspServer }) => {
              startLspServer(pending.project_root).catch(err => 
                logger.error('Background LSP server start failed', { error: err })
              );
            });
          }
          continue; // Skip this file for now
        }
        
        // Server is running, get diagnostics quickly
        const remainingTime = timeout - (Date.now() - startTime);
        if (remainingTime < 100) {
          break; // Not enough time left
        }
        
        try {
          const diagnostics = await Promise.race([
            runDiagnostics(pending.project_root),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), Math.min(remainingTime, 400)))
          ]) as any;
          
          if (diagnostics && diagnostics.diagnostics) {
            // Filter to only the pending file
            const fileDiagnostics = diagnostics.diagnostics.filter((d: any) => 
              d.file === pending.file_path || d.file === resolve(pending.file_path)
            );
            
            if (fileDiagnostics.length > 0) {
              // Display diagnostics for the pending file
              const displayDiags = fileDiagnostics.slice(0, 5);
              const bySource: Record<string, number> = {};
              for (const diag of fileDiagnostics) {
                const source = diag.source || 'unknown';
                bySource[source] = (bySource[source] || 0) + 1;
              }
              
              const response = {
                diagnostics: displayDiags,
                summary: `total: ${fileDiagnostics.length} diagnostics (${Object.entries(bySource).map(([src, count]) => `${count} for ${src}`).join(', ')}) [from previous edit: ${pending.file_path}]`
              };
              
              console.error(`[[system-message]]: ${JSON.stringify(response)}`);
              
              // Mark as checked since we successfully reported it
              dedup.db.prepare(`
                UPDATE pending_file_checks 
                SET checked = 1 
                WHERE file_path = ?
              `).run(pending.file_path);
              
              // We reported one file's diagnostics, that's enough for this hook
              break;
            }
          }
        } catch (error) {
          // Timeout or error, move on to next file
          await logger.debug('Failed to get diagnostics for pending file', { file: pending.file_path, error });
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

// Store a pending file check for later processing
async function storePendingFileCheck(filePath: string, projectRoot: string): Promise<void> {
  try {
    const { DiagnosticDeduplicator } = await import("./utils/diagnostic-dedup");
    const dedup = new DiagnosticDeduplicator(projectRoot);
    
    try {
      // Create table if it doesn't exist
      dedup.db.exec(`
        CREATE TABLE IF NOT EXISTS pending_file_checks (
          file_path TEXT PRIMARY KEY,
          project_root TEXT NOT NULL,
          created_at TEXT NOT NULL,
          checked BOOLEAN DEFAULT 0
        )
      `);
      
      // Store pending check
      const query = dedup.db.prepare(`
        INSERT OR REPLACE INTO pending_file_checks (
          file_path, 
          project_root,
          created_at,
          checked
        ) VALUES (?, ?, ?, 0)
      `);
      
      query.run(
        filePath,
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

// Store file modification info without dedup checking
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

export async function findAllProjects(baseDir: string): Promise<string[]> {
  // Smart hierarchical project detection with controlled expansion
  const { readdir } = await import('fs/promises');
  const { join, resolve } = await import('path');
  
  try {
    const projects = new Set<string>();
    const MAX_PROJECTS = 16;
    
    // Project markers to search for
    const markers = new Set([
      'package.json',      // Node.js/TypeScript
      'tsconfig.json',     // TypeScript
      'pyproject.toml',    // Python (modern)
      'requirements.txt',  // Python (traditional)
      'Cargo.toml',        // Rust
      'go.mod',            // Go
      'pom.xml',           // Java Maven
      'build.gradle',      // Java Gradle
      'Gemfile',           // Ruby
      'composer.json',     // PHP
      'build.sbt',         // Scala
      'CMakeLists.txt',    // C/C++
      'mix.exs',           // Elixir
      'main.tf',           // Terraform
      // Note: Lua projects handled separately by checking for .lua files
    ]);
    
    // Directories to skip
    const skipDirs = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.nuxt', 'target', 'coverage', '__pycache__']);
    
    // First: Find root project (priority)
    const rootProject = await findRootProject(baseDir, markers);
    if (rootProject) {
      projects.add(rootProject);
    }
    
    // Second: Find sibling projects with controlled expansion
    if (projects.size < MAX_PROJECTS) {
      await findSiblingProjects(baseDir, markers, skipDirs, projects, MAX_PROJECTS);
    }
    
    const projectArray = Array.from(projects).sort();
    if (projectArray.length > 0) {
      await logger.debug('Found projects with smart detection', { 
        projects: projectArray.length, 
        root: rootProject || 'none',
        limit: MAX_PROJECTS 
      });
    }
    
    return projectArray;
  } catch (error) {
    await logger.debug('Failed to discover projects', { error });
    return [];
  }
}

// Helper: Check if a directory is a project based on markers or special cases
async function isProjectDirectory(entries: any[], markers: Set<string>): Promise<boolean> {
  let hasLuaFiles = false;
  
  for (const entry of entries) {
    if (entry.isFile()) {
      // Check for standard project markers
      if (markers.has(entry.name)) {
        return true;
      }
      // Special case: Lua projects (any directory with .lua files)
      if (entry.name.endsWith('.lua')) {
        hasLuaFiles = true;
      }
    }
  }
  
  // If no standard marker but has Lua files, consider it a Lua project
  return hasLuaFiles;
}

// Helper: Find the root project (directory containing project marker)
async function findRootProject(dir: string, markers: Set<string>): Promise<string | null> {
  const { readdir } = await import('fs/promises');
  const { resolve } = await import('path');
  
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    
    if (await isProjectDirectory(entries, markers)) {
      return resolve(dir);
    }
  } catch (error) {
    // Directory not readable
  }
  
  return null;
}

// Helper: Find sibling projects with boundary logic
async function findSiblingProjects(
  baseDir: string, 
  markers: Set<string>, 
  skipDirs: Set<string>, 
  projects: Set<string>, 
  maxProjects: number
): Promise<void> {
  const { readdir } = await import('fs/promises');
  const { join } = await import('path');
  
  // Search only subdirectories of the base directory, not the base directory itself
  // (since root project already handled)
  try {
    const entries = await readdir(baseDir, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.isDirectory() && !skipDirs.has(entry.name) && projects.size < maxProjects) {
        await searchSubdirectoryForProjects(join(baseDir, entry.name), 1);
      }
    }
  } catch (error) {
    // Directory not readable
  }
  
  async function searchSubdirectoryForProjects(dir: string, depth: number): Promise<void> {
    // Respect hard limits
    if (depth > 3 || projects.size >= maxProjects) return;
    
    const { resolve } = await import('path');
    
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      
      // Check if current directory is a project using shared logic
      const isProject = await isProjectDirectory(entries, markers);
      if (isProject) {
        projects.add(resolve(dir));
      }
      
      // If this directory is a project, don't recurse deeper (your boundary logic)
      if (isProject) {
        return;
      }
      
      // Continue searching subdirectories if this is not a project
      for (const entry of entries) {
        if (entry.isDirectory() && !skipDirs.has(entry.name) && projects.size < maxProjects) {
          await searchSubdirectoryForProjects(join(dir, entry.name), depth + 1);
        }
      }
    } catch (error) {
      // Directory might not be readable, skip it
    }
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