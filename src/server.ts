#!/usr/bin/env bun

import { LSPClient } from "./lsp-client";
import { existsSync, watch } from "fs";
import { join, relative } from "path";
import { 
  validatePathWithinRoot, 
  secureHash,
  cleanupManager,
  safeDeleteFile
} from "./utils/security";
import { RateLimiter } from "./utils/rate-limiter";
import { logger } from "./utils/logger";

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
    this.projectRoot = projectRoot;
    this.projectHash = secureHash(projectRoot).substring(0, 16);
    this.client = new LSPClient();
    this.rateLimiter = new RateLimiter(100, 60000); // 100 requests per minute
    
    logger.setProject(this.projectHash);
  }

  async start() {
    await logger.info(`🚀 Claude Code LSP Server`);
    await logger.info(`📁 Project root: ${this.projectRoot}`);
    await logger.info(`🔑 Project hash: ${this.projectHash}`);
    await logger.info(`🔍 Detecting project type...`);
    
    // Detect and initialize language servers
    const hasTypeScript = await this.detectTypeScriptProject();
    const hasPython = await this.detectPythonProject();
    
    if (hasTypeScript) {
      await logger.info("📘 TypeScript project detected");
      await this.client.initializeTypeScript(this.projectRoot);
    }
    
    if (hasPython) {
      await logger.info("🐍 Python project detected");
      await this.client.initializePython(this.projectRoot);
    }
    
    if (!hasTypeScript && !hasPython) {
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
      await this.client.shutdown();
      // Restore original umask
      process.umask(oldUmask);
    });
    
    const server = Bun.serve({
      port: 3939,
      unix: socketPath,
      fetch: this.handleRequest.bind(this),
      error: async (error) => {
        await logger.error('Server error', error);
        return new Response("Internal Server Error", { status: 500 });
      }
    });

    await logger.info(`\n🌐 Server running on:`);
    await logger.info(`  HTTP: http://localhost:3939`);
    await logger.info(`  Unix: ${socketPath}`);
    await logger.info(`\n📌 API Endpoints (protected by Unix socket permissions):`);
    await logger.info(`  GET /diagnostics?file= - Get diagnostics for specific file`);
    await logger.info(`  GET /diagnostics/all   - Get all project diagnostics`);
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

  private async detectTypeScriptProject(): Promise<boolean> {
    // Check common TypeScript project indicators
    const roots = [
      this.projectRoot,
      join(this.projectRoot, "ui"),
      join(this.projectRoot, "frontend"),
      join(this.projectRoot, "client"),
      join(this.projectRoot, "web"),
      join(this.projectRoot, "src")
    ];
    
    for (const root of roots) {
      if (existsSync(join(root, "tsconfig.json")) || existsSync(join(root, "package.json"))) {
        return true;
      }
    }
    
    return false;
  }

  private async detectPythonProject(): Promise<boolean> {
    // Check common Python project indicators
    if (existsSync(join(this.projectRoot, "requirements.txt")) || 
        existsSync(join(this.projectRoot, "setup.py")) ||
        existsSync(join(this.projectRoot, "pyproject.toml"))) {
      return true;
    }
    
    // Check for Python files
    const files = await import("fs").then(fs => fs.readdirSync(this.projectRoot));
    return files.some(file => file.endsWith(".py"));
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
    const extensions = ['.ts', '.tsx', '.js', '.jsx', '.py', '.pyi'];
    return extensions.some(ext => filename.endsWith(ext));
  }

  private async openDocument(filePath: string) {
    if (!this.openDocuments.has(filePath)) {
      await this.client.openDocument(filePath);
      this.openDocuments.add(filePath);
    }
  }

  private async updateDocument(filePath: string) {
    if (this.openDocuments.has(filePath)) {
      await this.client.updateDocument(filePath);
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
        
        case "/shutdown":
          if (req.method === "POST") {
            // Graceful shutdown
            await logger.info('Shutdown requested', { projectHash: this.projectHash });
            
            // Cleanup LSP client connections
            if (this.client) {
              await this.client.stopAllServers();
            }
            
            // Remove PID file
            const socketDir = process.env.XDG_RUNTIME_DIR || 
                             (process.platform === 'darwin' 
                               ? `${process.env.HOME}/Library/Application Support/claude-lsp/run`
                               : `${process.env.HOME}/.claude-lsp/run`);
            const pidFile = `${socketDir}/claude-lsp-${this.projectHash}.pid`;
            try {
              await safeDeleteFile(pidFile);
            } catch (error) {
              await logger.debug('PID file cleanup failed', { error });
            }
            
            // Send success response before shutting down
            const response = new Response(JSON.stringify({ 
              status: "shutdown_initiated",
              projectHash: this.projectHash
            }), { headers });
            
            // Exit gracefully after a short delay
            setTimeout(() => {
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
      // Open document if not already open
      await this.openDocument(fullPath);
      
      // Get diagnostics
      const diagnostics = this.client.getDiagnostics(fullPath);
      const relativePath = relative(this.projectRoot, fullPath);
      
      const response: DiagnosticResponse[] = diagnostics.map(d => ({
        file: relativePath,
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
      const allDiagnostics: DiagnosticResponse[] = [];
      
      for (const [filePath, diagnostics] of this.client.getAllDiagnostics()) {
        const relativePath = relative(this.projectRoot, filePath);
        
        for (const d of diagnostics) {
          allDiagnostics.push({
            file: relativePath,
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
    await this.client.shutdown();
  }
}

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