#!/usr/bin/env bun

import { LSPClient } from "./server-lsp-client";
import { existsSync, watch, readFileSync } from "fs";
import { readFile } from "node:fs/promises";
import * as fs from "fs";
import { join, relative, resolve } from "path";
import ignore from "ignore";
import { 
  secureHash,
  cleanupManager,
} from "./utils/security";
import { RateLimiter } from "./utils/rate-limiter";
import { logger } from "./utils/logger";
import { ProjectConfigDetector } from "./project-config-detector";
import { DiagnosticDeduplicator } from "./utils/diagnostic-dedup";
import { TIMEOUTS } from "./constants";
import { ServerRegistry } from "./utils/server-registry";

interface DiagnosticResponse {
  file: string;
  line: number;
  column: number;
  severity: "error" | "warning" | "info" | "hint";
  message: string;
  source: string;
  ruleId?: string;
}

class LSPHttpServer {
  private client: LSPClient;
  private projectRoot: string;
  private projectHash: string;
  private openDocuments: Set<string> = new Set();
  private rateLimiter: RateLimiter;
  private deduplicator: DiagnosticDeduplicator;

  constructor(projectRoot: string) {
    // Normalize to absolute path for consistent hashing
    this.projectRoot = resolve(projectRoot);
    this.projectHash = secureHash(this.projectRoot).substring(0, 16);
    this.deduplicator = new DiagnosticDeduplicator(this.projectRoot);
    this.client = new LSPClient(this.projectHash, this.deduplicator);
    this.rateLimiter = new RateLimiter(100, TIMEOUTS.RATE_LIMIT_WINDOW_MS); // 100 requests per minute
    
    logger.setProject(this.projectHash);
  }

  async start() {
    await logger.info(`🚀 Claude Code LSP Server`);
    await logger.info(`📁 Project root: ${this.projectRoot}`);
    await logger.info(`🔑 Project hash: ${this.projectHash}`);
    await logger.info(`🔍 Detecting project type...`);
    
    // Use ProjectConfigDetector to detect all supported languages
    const detector = new ProjectConfigDetector(this.projectRoot);
    const projectConfig = await detector.detect();
    
    const detectedLanguages: string[] = [];
    
    if (projectConfig) {
      await logger.info(`✅ Detected ${projectConfig.language} project`);
      
      // Map project language to LSP language identifier
      const languageMap: Record<string, string> = {
        'typescript': 'typescript',
        'javascript': 'typescript',
        'react': 'typescript',
        'next': 'typescript',
        'vue': 'typescript',
        // 'python': 'python',  // Disabled - spamming issues
        'rust': 'rust',
        'go': 'go',
        'scala': 'scala',
        'java': 'java',
        'cpp': 'cpp',
        'ruby': 'ruby',
        'php': 'php',
        'lua': 'lua',
        'elixir': 'elixir',
        'terraform': 'terraform'
      };
      
      const lspLanguage = languageMap[projectConfig.language];
      if (lspLanguage) {
        await this.client.startLanguageServer(lspLanguage, this.projectRoot);
        detectedLanguages.push(lspLanguage);
      }
    } else {
      await logger.warn("⚠️  No supported project type detected");
    }

    // Setup file watching with error handling
    try {
      await this.setupFileWatching();
    } catch (error) {
      await logger.error('Failed to setup file watching', error);
    }

    // Determine socket directory based on platform
    const socketDir = process.env.XDG_RUNTIME_DIR || 
                     (process.platform === 'darwin' 
                       ? `${process.env.HOME}/Library/Application Support/claude-lsp/run`
                       : `${process.env.HOME}/.claude-lsp/run`);
    
    // Ensure socket directory exists with proper permissions
    const fs = await import("fs");
    if (!fs.existsSync(socketDir)) {
      fs.mkdirSync(socketDir, { recursive: true, mode: 0o700 });
    }
    
    // Set restrictive umask before creating socket
    const oldUmask = process.umask(0o077);
    
    const socketPath = `${socketDir}/claude-lsp-${this.projectHash}.sock`;
    
    // Register server with the registry
    const registry = ServerRegistry.getInstance();
    registry.registerServer(
      this.projectRoot,
      detectedLanguages,
      process.pid,
      socketPath
    );
    
    // Setup heartbeat to keep registry updated
    setInterval(() => {
      registry.updateHeartbeat(this.projectHash);
    }, 30000); // Update every 30 seconds
    
    // Clean up any existing socket file
    try {
      if (fs.existsSync(socketPath)) {
        fs.unlinkSync(socketPath);
      }
    } catch (error) {
      await logger.error('Failed to clean up socket file', error);
    }
    
    // Register cleanup handler
    cleanupManager.addCleanupHandler(async () => {
      await this.client.stopAllServers();
      
      // Mark server as stopped in registry
      registry.markServerStopped(this.projectHash);
      
      // Clean up socket and related files
      const filesToClean = [
        socketPath,
        `${socketDir}/claude-lsp-${this.projectHash}.pid`,
        `${socketDir}/claude-lsp-${this.projectHash}.start`
      ];
      
      for (const file of filesToClean) {
        try {
          if (fs.existsSync(file)) {
            fs.unlinkSync(file);
            await logger.debug(`Cleaned up: ${file}`);
          }
        } catch (error) {
          await logger.error(`Failed to clean up ${file}:`, error);
        }
      }
      
      // Restore original umask
      process.umask(oldUmask);
    });
    
    Bun.serve({
      unix: socketPath as any,
      fetch: this.handleRequest.bind(this),
      error: async (error) => {
        await logger.error('Server error', error);
        return new Response("Internal Server Error", { status: 500 });
      }
    });

    await logger.info(`\n🌐 Server running on:`);
    await logger.info(`  Unix socket: ${socketPath}`);
    await logger.info(`\n📌 API Endpoints (protected by Unix socket permissions):`);
    await logger.info(`  GET /diagnostics?file= - Get diagnostics for specific file`);
    await logger.info(`  GET /diagnostics/all   - Get all project diagnostics`);
    await logger.info(`  GET /languages         - Get detected project languages`);
    await logger.info(`  GET /health           - Health check (no auth required)`);
    
    // Write PID file for process management
    const pidFile = `${socketDir}/claude-lsp-${this.projectHash}.pid`;
    await Bun.write(pidFile, process.pid.toString()).catch(async (error) => {
      await logger.error('Failed to write PID file', error);
    });
    
    // Restore original umask after socket creation
    process.umask(oldUmask);
    
    // Periodic cleanup
    setInterval(() => {
      this.rateLimiter.cleanup();
    }, TIMEOUTS.CLEANUP_INTERVAL_MS);
  }


  private async setupFileWatching() {
    try {
      watch(this.projectRoot, { recursive: true }, async (event, filename) => {
        if (!filename) return;
        
        try {
          const fullPath = join(this.projectRoot, filename);
          
          // Skip non-code files
          if (!this.isCodeFile(filename)) return;
          
          await logger.debug(`File ${event}: ${filename}`);
          
          if (event === 'rename') {
            // File created or deleted
            if (existsSync(fullPath)) {
              await this.openDocument(fullPath);
            } else {
              this.closeDocument(fullPath);
            }
          } else if (event === 'change') {
            // File modified
            await this.updateDocument(fullPath);
          }
        } catch (error) {
          await logger.error('File watching error', error, { filename, event });
        }
      });
    } catch (error) {
      await logger.error('Failed to setup file watching', error);
    }
  }

  private isCodeFile(filename: string): boolean {
    // Support all 13 languages from README
    const extensions = [
      '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',  // TypeScript/JavaScript
      '.py', '.pyi',                                  // Python
      '.rs',                                         // Rust
      '.go',                                         // Go
      '.java',                                       // Java
      '.c', '.cpp', '.cc', '.cxx', '.h', '.hpp', '.hxx',  // C/C++
      '.rb', '.erb', '.rake',                        // Ruby
      '.php',                                        // PHP
      '.lua',                                        // Lua
      '.ex', '.exs',                                 // Elixir
      '.tf', '.tfvars',                              // Terraform
      '.scala', '.sc', '.sbt'                        // Scala
    ];
    return extensions.some(ext => filename.endsWith(ext));
  }

  private async loadGitignorePatterns(projectRoot: string): Promise<string[]> {
    try {
      const gitignorePath = join(projectRoot, '.gitignore');
      let patterns = [
        // Default ignore patterns
        'node_modules/**',
        'dist/**',
        'build/**',
        'coverage/**',
        '.git/**',
        '**/*.min.js',
        '**/*.d.ts',
        'vendor/**',
        '.bundle/**',
        // Common build/cache directories
        'target/**',      // Rust, Scala, Java
        '.metals/**',     // Scala Metals
        '.bloop/**',      // Scala Bloop  
        'project/target/**', // Scala sbt
        '.idea/**',       // IntelliJ
        '.vscode/**',     // VS Code
        '**/*.log',       // Log files
        'tmp/**',         // Temporary files
        'temp/**'         // Temporary files
      ];

      if (existsSync(gitignorePath)) {
        try {
          const content = await readFile(gitignorePath, 'utf-8');
          const gitignorePatterns = content
            .split('\n')
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('#'))
            .map(line => line.endsWith('/') ? `${line}**` : line);
          
          patterns = patterns.concat(gitignorePatterns);
        } catch (error) {
          await logger.warn('Failed to read .gitignore', { error });
        }
      }

      return patterns;
    } catch (error) {
      await logger.warn('Failed to load gitignore patterns', { error });
      return [
        'node_modules/**',
        'dist/**', 
        'build/**',
        'coverage/**',
        '.git/**',
        'target/**',
        '.metals/**'
      ];
    }
  }

  private async openDocument(filePath: string, waitForDiagnostics: boolean = false) {
    if (!this.openDocuments.has(filePath)) {
      await this.client.openDocument(filePath, waitForDiagnostics);
      this.openDocuments.add(filePath);
    }
  }

  private async updateDocument(filePath: string) {
    if (this.openDocuments.has(filePath)) {
      const content = await Bun.file(filePath).text();
      await this.client.updateDocument(filePath, content);
    } else {
      await this.openDocument(filePath);
    }
  }

  private closeDocument(filePath: string) {
    if (this.openDocuments.has(filePath)) {
      this.client.closeDocument(filePath);
      this.openDocuments.delete(filePath);
    }
  }

  private async handleRequest(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;

    // CORS headers
    const headers = {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    };

    if (req.method === "OPTIONS") {
      return new Response(null, { headers, status: 204 });
    }

    // Apply rate limiting
    const rateLimitResponse = this.rateLimiter.limit(req);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    // Unix socket permissions provide authentication
    // No additional auth needed for local-only access

    try {
      switch (path) {
        case "/diagnostics":
          return this.handleDiagnostics(req, headers);
        
        case "/health":
          return new Response(JSON.stringify({ 
            status: "healthy",
            projectHash: this.projectHash,
            uptime: process.uptime()
          }), { headers });
        
        case "/languages":
          return this.handleLanguages(headers);
        
        case "/reset":
          if (req.method === "POST") {
            return this.handleReset(headers);
          } else {
            return new Response("Method Not Allowed", { status: 405 });
          }
        
        case "/reset-dedup":
          if (req.method === "POST") {
            return this.handleResetDedup(headers);
          } else {
            return new Response("Method Not Allowed", { status: 405 });
          }
        
        case "/shutdown":
          if (req.method === "POST") {
            // Graceful shutdown
            await logger.info('Shutdown requested', { projectHash: this.projectHash });
            
            // Send success response before shutting down
            const response = new Response(JSON.stringify({ 
              status: "shutdown_initiated",
              projectHash: this.projectHash
            }), { headers });
            
            // Perform full cleanup and exit gracefully after a short delay
            setTimeout(async () => {
              await this.shutdown();
              process.exit(0); // cleanup: shutdown called above
            }, 100);
            
            return response;
          } else {
            return new Response(JSON.stringify({ error: "Method not allowed" }), { 
              headers, 
              status: 405 
            });
          }
        
        default:
          return new Response(JSON.stringify({ error: "Not found" }), { 
            headers, 
            status: 404 
          });
      }
    } catch (error) {
      await logger.error('Request handling error', error, { path });
      return new Response(JSON.stringify({ error: "Internal server error" }), { 
        headers, 
        status: 500 
      });
    }
  }


  private async handleDiagnostics(req: Request, headers: any): Promise<Response> {
    try {
      const url = new URL(req.url);
      const filePath = url.searchParams.get('file');
      
      // Determine if this is file-specific or project-wide
      const debugInfo = undefined; // Remove debug output
      
      // Always use project-wide logic, just filter if file specified
      const response = await this.handleProjectDiagnostics(headers, filePath || undefined, debugInfo);
      return response;
    } catch (error) {
      await logger.error('Failed to handle diagnostics', error);
      throw error;
    }
  }

  private async handleProjectDiagnostics(headers: any, filterFile?: string, debugInfo?: string): Promise<Response> {
    try {
      // Skip detailed logging to avoid serialization issues
      
      // First, discover and open all relevant files in the project
      await this.discoverAndOpenProjectFiles();
      
      // Wait longer for diagnostics to be collected (some LSPs are slow)
      await new Promise(resolve => setTimeout(resolve, 2000)); // Reduced from 4000ms
      
      // Get raw diagnostics from LSP
      const rawDiagnostics: DiagnosticResponse[] = [];
      const allDiagnosticsMap = this.client.getAllDiagnostics();
      
      // Track diagnostics for internal use
      const diagnosticFiles = Array.from(allDiagnosticsMap.keys());
      
      for (const [filePath, diagnostics] of allDiagnosticsMap) {
        // If filtering by file, check if this is the file we want
        let shouldInclude = true;
        if (filterFile) {
          // Convert both paths to absolute for consistent comparison
          const absoluteFilePath = resolve(filePath); // Already absolute from LSP
          let absoluteFilterPath: string;
          
          try {
            if (filterFile.startsWith('/')) {
              // Already absolute path
              absoluteFilterPath = resolve(filterFile);
            } else {
              // Relative path - resolve relative to project root
              absoluteFilterPath = resolve(this.projectRoot, filterFile);
            }
            
            // Compare absolute paths
            shouldInclude = (absoluteFilePath === absoluteFilterPath);
          } catch (error) {
            // Skip logger to avoid serialization issues
            shouldInclude = false;
            continue;
          }
        }
        
        if (!shouldInclude) continue;
        
        for (const d of diagnostics) {
          rawDiagnostics.push({
            file: filePath,  // Return absolute path for consistency
            line: d.range.start.line + 1,
            column: d.range.start.character + 1,
            severity: this.mapSeverity(d.severity),
            message: d.message,
            source: d.source || "lsp",
            ruleId: d.code?.toString()
          });
        }
      }
      
      // Filter to only errors and warnings
      let relevantDiagnostics = rawDiagnostics.filter(d => 
        d.severity === 'error' || d.severity === 'warning'
      );
      
      // Filter out diagnostics from ignored files
      const gitignorePatterns = await this.loadGitignorePatterns(this.projectRoot);
      const ig = ignore().add(gitignorePatterns);
      
      relevantDiagnostics = relevantDiagnostics.filter(d => {
        const relativePath = relative(this.projectRoot, d.file);
        return !ig.ignores(relativePath);
      });
      
      // Run server-side deduplication for project-wide, skip for file-specific
      const newItemsToDisplay = filterFile 
        ? relevantDiagnostics  // File-specific: no deduplication
        : await this.deduplicator.processDiagnostics(relevantDiagnostics); // Project-wide: deduplication
      
      // Sort by priority: errors before warnings, then by line and column
      const sortedItems = newItemsToDisplay.sort((a, b) => {
        // First sort by severity (errors before warnings) 
        if (a.severity === 'error' && b.severity === 'warning') return -1;
        if (a.severity === 'warning' && b.severity === 'error') return 1;
        
        // Then sort by line number (ensure both are numbers)
        const lineA = typeof a.line === 'number' ? a.line : parseInt(a.line) || 0;
        const lineB = typeof b.line === 'number' ? b.line : parseInt(b.line) || 0;
        if (lineA !== lineB) return lineA - lineB;
        
        // Finally sort by column (ensure both are numbers) 
        const colA = typeof a.column === 'number' ? a.column : parseInt(a.column) || 0;
        const colB = typeof b.column === 'number' ? b.column : parseInt(b.column) || 0;
        return colA - colB;
      });
      
      // Always limit to 5 items (both project-wide and file-specific)
      const itemsToDisplay = sortedItems.slice(0, 5);
      const displayDiagnostics = itemsToDisplay.map(diag => ({
        ...diag,
        file: relative(this.projectRoot, diag.file)
      }));
      
      // Mark only the displayed items as shown (add to dedup database) - only for project-wide
      // Non-displayed items remain "new" for next time
      if (displayDiagnostics.length > 0 && !filterFile) {
        await this.deduplicator.markAsDisplayed(displayDiagnostics);
      }
      
      // Calculate summary statistics by language/source
      const bySource: Record<string, number> = {};
      for (const diag of relevantDiagnostics) {
        const source = diag.source || 'unknown';
        bySource[source] = (bySource[source] || 0) + 1;
      }
      
      // Generate descriptive summary  
      let summary: string;
      if (relevantDiagnostics.length === 0) {
        summary = "no warnings or errors";
      } else {
        const errorCount = relevantDiagnostics.filter(d => d.severity === 'error').length;
        const warningCount = relevantDiagnostics.filter(d => d.severity === 'warning').length;
        
        if (errorCount > 0 && warningCount > 0) {
          summary = `${errorCount} error(s), ${warningCount} warning(s)`;
        } else if (errorCount > 0) {
          summary = `${errorCount} error(s)`;
        } else {
          summary = `${warningCount} warning(s)`;
        }
      }

      // Check if we should display "no errors" state (only for project-wide)
      if (relevantDiagnostics.length === 0 && !filterFile) {
        // Check if we already showed "no errors" state via deduplicator
        const shouldShow = await this.deduplicator.shouldShowNoErrorsState();
        if (!shouldShow) {
          // Don't show "no errors" again - return empty response
          return new Response("", { headers });
        }
      }

      const result: any = { summary };
      
      // Only include diagnostics array if there are actual diagnostics
      if (displayDiagnostics.length > 0) {
        result.diagnostics = displayDiagnostics;
      }
      
      try {
        const responseText = `[[system-message]]:${JSON.stringify(result)}`;
        return new Response(responseText, { headers });
      } catch (jsonError) {
        // Skip logger to avoid nested serialization issues
        return new Response(`[[system-message]]:{"diagnostics":[],"summary":"json error"}`, { headers });
      }
    } catch (error) {
      // Skip logger to avoid serialization issues, just throw
      throw error;
    }
  }

  private async handleLanguages(headers: any): Promise<Response> {
    try {
      // Import language detection utilities
      const { detectProjectLanguages, languageServers } = await import('./language-servers');
      
      // Detect project languages based on project files
      const detectedLanguages = detectProjectLanguages(this.projectRoot);
      
      // Create language info objects with details
      const languages = detectedLanguages.map(lang => {
        const config = languageServers[lang];
        return {
          language: lang,
          extensions: config?.extensions || [],
          installed: true // Assume installed if detected
        };
      });
      
      return new Response(JSON.stringify(languages), { headers });
    } catch (error) {
      await logger.error('Failed to get languages', error);
      return new Response(JSON.stringify([]), { headers });
    }
  }

  private async handleReset(headers: any): Promise<Response> {
    try {
      await logger.info('Reset requested', { projectHash: this.projectHash });
      
      // Close all open documents to force refresh from disk
      const openDocuments = Array.from(this.openDocuments);
      for (const filePath of openDocuments) {
        this.closeDocument(filePath);
      }
      
      // Clear the client's diagnostic cache
      this.client.clearDiagnostics();
      
      // Restart language servers to get fresh state
      await this.client.restartServers();
      
      // Wait a moment for servers to initialize
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Re-discover and open project files
      await this.discoverAndOpenProjectFiles();
      
      await logger.info('Reset completed', { projectHash: this.projectHash });
      
      return new Response(JSON.stringify({ 
        status: "reset_completed",
        projectHash: this.projectHash,
        documentsReset: openDocuments.length
      }), { headers });
    } catch (error) {
      await logger.error('Failed to reset server', error);
      return new Response(JSON.stringify({
        status: "reset_failed",
        error: error instanceof Error ? error.message : "Unknown error"
      }), { 
        status: 500,
        headers 
      });
    }
  }
  
  private async handleResetDedup(headers: any): Promise<Response> {
    try {
      await logger.info('Deduplication reset requested', { projectHash: this.projectHash });
      
      // Reset only the deduplication system without restarting servers
      await this.deduplicator.resetAll();
      
      await logger.info('Deduplication reset completed', { projectHash: this.projectHash });
      
      return new Response(JSON.stringify({ 
        status: "dedup_reset_completed",
        projectHash: this.projectHash,
        message: "Deduplication system cleared - all diagnostics will be shown again"
      }), { headers });
    } catch (error) {
      await logger.error('Failed to reset deduplication', error);
      return new Response(JSON.stringify({
        status: "dedup_reset_failed",
        error: error instanceof Error ? error.message : "Unknown error"
      }), { 
        status: 500,
        headers 
      });
    }
  }


  private async discoverAndOpenProjectFiles(): Promise<void> {
    try {
      // Import language detection utilities
      const { detectProjectLanguages, languageServers } = await import('./language-servers');
      
      // Detect project languages based on project files
      const detectedLanguages = detectProjectLanguages(this.projectRoot);
      
      // Collect all extensions for detected languages
      const extensions = new Set<string>();
      for (const lang of detectedLanguages) {
        const config = languageServers[lang];
        if (config?.extensions) {
          config.extensions.forEach(ext => extensions.add(ext.substring(1))); // Remove leading dot
        }
      }
      
      // If no languages detected via project files, try to get from active servers
      if (extensions.size === 0) {
        const activeExtensions = this.client.getActiveFileExtensions();
        activeExtensions.forEach(ext => extensions.add(ext.substring(1)));
      }
      
      if (extensions.size === 0) {
        // No languages detected, skip file discovery
        await logger.debug("No languages detected for file discovery");
        return;
      }
      
      // Build glob pattern from extensions
      const extensionArray = Array.from(extensions);
      const globPattern = extensionArray.length > 1
        ? `**/*.{${extensionArray.join(',')}}` 
        : `**/*.${extensionArray[0]}`;
      
      // Load gitignore patterns
      const gitignorePatterns = await this.loadGitignorePatterns(this.projectRoot);
      
      const { glob } = await import('glob');
      const files = await glob(globPattern, {
        cwd: this.projectRoot,
        ignore: gitignorePatterns
      });
      
      // Open files in batches to avoid overwhelming the language server
      const BATCH_SIZE = 5;
      for (let i = 0; i < files.length; i += BATCH_SIZE) {
        const batch = files.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map(async (file) => {
          const fullPath = join(this.projectRoot, file);
          try {
            await this.openDocument(fullPath);
          } catch (error) {
            // Skip files that can't be opened
            await logger.debug(`Could not open file: ${file}`, { error });
          }
        }));
        // Small delay between batches
        if (i + BATCH_SIZE < files.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
    } catch (error) {
      await logger.error('Failed to discover project files', error);
      // Don't throw, just continue with whatever diagnostics we have
    }
  }

  private mapSeverity(severity?: number): DiagnosticResponse["severity"] {
    switch (severity) {
      case 1: return "error";
      case 2: return "warning";
      case 3: return "info";
      case 4: return "hint";
      default: return "info";
    }
  }

  async shutdown() {
    await logger.info('Shutting down LSP server...');
    await this.client.stopAllServers();
    
    // Clean up socket and related files
    const socketDir = process.env.XDG_RUNTIME_DIR || 
                     (process.platform === 'darwin' 
                       ? `${process.env.HOME}/Library/Application Support/claude-lsp/run`
                       : `${process.env.HOME}/.claude-lsp/run`);
    
    const filesToClean = [
      `${socketDir}/claude-lsp-${this.projectHash}.sock`,
      `${socketDir}/claude-lsp-${this.projectHash}.pid`,
      `${socketDir}/claude-lsp-${this.projectHash}.start`
    ];
    
    for (const file of filesToClean) {
      try {
        if (fs.existsSync(file)) {
          fs.unlinkSync(file);
          await logger.debug(`Cleaned up: ${file}`);
        }
      } catch (error) {
        await logger.error(`Failed to clean up ${file}:`, error);
      }
    }
  }
}

// Export for testing
export { LSPHttpServer };

// Main execution
if (import.meta.main) {
  const projectRoot = process.argv[2] || process.cwd();
  const server = new LSPHttpServer(projectRoot);
  
  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    await server.shutdown();
    process.exit(0); // cleanup: shutdown completed
  });
  
  process.on('SIGTERM', async () => {
    await server.shutdown();
    process.exit(0); // cleanup: shutdown completed
  });
  
  await server.start();
}