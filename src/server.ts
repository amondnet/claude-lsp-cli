#!/usr/bin/env bun

import { LSPClient } from "./lsp-client";
import { existsSync, watch } from "fs";
import * as fs from "fs";
import { join, relative, resolve } from "path";
import { 
  validatePathWithinRoot, 
  secureHash,
  cleanupManager,
  safeDeleteFile
} from "./utils/security";
import { RateLimiter } from "./utils/rate-limiter";
import { logger } from "./utils/logger";
import { ProjectConfigDetector } from "./project-config-detector";

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

  constructor(projectRoot: string) {
    // Normalize to absolute path for consistent hashing
    this.projectRoot = resolve(projectRoot);
    this.projectHash = secureHash(this.projectRoot).substring(0, 16);
    this.client = new LSPClient();
    this.rateLimiter = new RateLimiter(100, 60000); // 100 requests per minute
    
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
    
    if (projectConfig) {
      await logger.info(`✅ Detected ${projectConfig.language} project`);
      
      // Map project language to LSP language identifier
      const languageMap: Record<string, string> = {
        'typescript': 'typescript',
        'javascript': 'typescript',
        'react': 'typescript',
        'next': 'typescript',
        'vue': 'typescript',
        'python': 'python',
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
    }, 60000);
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
          const fileParam = url.searchParams.get("file");
          if (fileParam) {
            // Validate path to prevent traversal
            const validatedPath = validatePathWithinRoot(this.projectRoot, fileParam);
            if (!validatedPath) {
              return new Response(
                JSON.stringify({ error: "Invalid file path" }), 
                { headers, status: 400 }
              );
            }
            return this.handleFileDiagnostics(validatedPath, headers);
          } else {
            return this.handleAllDiagnostics(headers);
          }
        
        case "/diagnostics/all":
          return this.handleAllDiagnostics(headers);
        
        case "/health":
          return new Response(JSON.stringify({ 
            status: "healthy",
            projectHash: this.projectHash,
            uptime: process.uptime()
          }), { headers });
        
        case "/languages":
          return this.handleLanguages(headers);
        
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
              process.exit(0);
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

  private async handleFileDiagnostics(fullPath: string, headers: any): Promise<Response> {
    try {
      // Open document and wait for diagnostics to be published
      await this.openDocument(fullPath, true);
      
      // Get diagnostics
      const diagnostics = this.client.getDiagnostics(fullPath);
      
      const response: DiagnosticResponse[] = diagnostics.map(d => ({
        file: fullPath,  // Return absolute path for consistency
        line: d.range.start.line + 1,
        column: d.range.start.character + 1,
        severity: this.mapSeverity(d.severity),
        message: d.message,
        source: d.source || "lsp",
        ruleId: d.code?.toString()
      }));
      
      return new Response(JSON.stringify({
        diagnostics: response,
        timestamp: new Date().toISOString()
      }), { headers });
    } catch (error) {
      await logger.error('Failed to get file diagnostics', error, { fullPath });
      throw error;
    }
  }

  private async handleAllDiagnostics(headers: any): Promise<Response> {
    try {
      // First, discover and open all relevant files in the project
      await this.discoverAndOpenProjectFiles();
      
      // Wait a bit for diagnostics to be collected
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const allDiagnostics: DiagnosticResponse[] = [];
      
      for (const [filePath, diagnostics] of this.client.getAllDiagnostics()) {
        for (const d of diagnostics) {
          allDiagnostics.push({
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
      
      return new Response(JSON.stringify({
        diagnostics: allDiagnostics,
        timestamp: new Date().toISOString()
      }), { headers });
    } catch (error) {
      await logger.error('Failed to get all diagnostics', error);
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
      
      const { glob } = await import('glob');
      const files = await glob(globPattern, {
        cwd: this.projectRoot,
        ignore: [
          'node_modules/**',
          'dist/**',
          'build/**',
          'coverage/**',
          '.git/**',
          '**/*.min.js',
          '**/*.d.ts',
          'vendor/**',
          '.bundle/**'
        ]
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
    process.exit(0);
  });
  
  process.on('SIGTERM', async () => {
    await server.shutdown();
    process.exit(0);
  });
  
  await server.start();
}