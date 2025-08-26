#!/usr/bin/env bun

import { spawn, ChildProcess } from "child_process";
import * as rpc from "vscode-jsonrpc/node";
import { 
  InitializeParams,
  TextDocumentItem,
  VersionedTextDocumentIdentifier,
  TextDocumentContentChangeEvent,
  Diagnostic,
  DiagnosticSeverity
} from "vscode-languageserver-protocol";
import { readFileSync, existsSync } from "fs";
import { join, resolve, extname } from "path";
import { logger } from "./utils/logger";
import { 
  languageServers, 
  detectProjectLanguages, 
  isLanguageServerInstalled,
  getInstallInstructions,
  LanguageServerConfig 
} from "./language-servers";

interface LSPServer {
  process: ChildProcess;
  connection: rpc.MessageConnection;
  initialized: boolean;
  rootUri: string;
  language: string;
  metalsReady?: boolean;
}

import { DiagnosticDeduplicator } from './utils/diagnostic-dedup.js';

export class LSPClient {
  private servers: Map<string, LSPServer> = new Map();
  private diagnostics: Map<string, Diagnostic[]> = new Map();
  private documentVersions: Map<string, number> = new Map();
  private fileLanguageMap: Map<string, string> = new Map();
  private receivedDiagnostics: Set<string> = new Set(); // Track files that have received diagnostics
  private projectHash: string;
  private deduplicator: DiagnosticDeduplicator | null;

  constructor(projectHash?: string, deduplicator?: DiagnosticDeduplicator) {
    this.projectHash = projectHash || 'default';
    this.deduplicator = deduplicator || null;
  }

  /**
   * Safely install a language server using spawn instead of execSync
   * to prevent command injection vulnerabilities
   */
  private async safeInstall(config: LanguageServerConfig, cwd: string): Promise<void> {
    if (!config.installCommand) {
      throw new Error("No install command provided");
    }

    // Parse the command safely
    // For simple commands like "bun add package"
    const parts = config.installCommand.split(' ');
    
    // Special handling for complex commands with pipes or redirects
    // These should be rewritten to use multiple spawn calls
    if (config.installCommand.includes('|') || config.installCommand.includes('>')) {
      // For now, throw an error for complex commands that need rewriting
      throw new Error(
        `Complex install command for ${config.name} needs to be rewritten for security. ` +
        `Commands with pipes or redirects are not allowed: ${config.installCommand}`
      );
    }

    return new Promise<void>((resolve, reject) => {
      const [command, ...args] = parts;
      const child = spawn(command!, args, {
        cwd,
        stdio: 'inherit'
        // Note: shell:false is the default, keeping it explicit for security
      });

      child.on('error', (error: Error) => {
        reject(new Error(`Failed to start install process: ${error.message}`));
      });

      child.on('exit', (code: number | null) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Install process exited with code ${code}`));
        }
      });
    });
  }

  async startLanguageServer(language: string, rootPath: string): Promise<void> {
    const config = languageServers[language];
    if (!config) {
      await logger.error(`Unknown language: ${language}`);
      return;
    }

    // Check if we already have a server running for this language/project combo
    if (this.deduplicator) {
      const existing = this.deduplicator.getLanguageServer(this.projectHash, language);
      if (existing) {
        await logger.info(`♻️  Reusing existing ${config.name} server (PID: ${existing.pid})`);
        // TODO: Connect to existing server instead of spawning new one
        // For now, just log that we found it
        return;
      }
    }

    await logger.info(`Starting ${config.name} Language Server...`);
    
    // Check if server is installed
    if (!isLanguageServerInstalled(language)) {
      await logger.error(getInstallInstructions(language));
      
      // Skip auto-install for bundled servers or auto-download servers
      if (config.installCheck === 'BUNDLED') {
        // These are bundled in the binary, just continue
        await logger.info(`${config.name} is bundled - no installation needed`);
      } else if (config.installCheck === 'SKIP') {
        // These auto-download via npx, just continue
        await logger.info(`${config.name} will be downloaded automatically via npx...`);
      }
      // For non-global packages, try auto-install (but NOT for our bunx servers)
      else if (!config.requiresGlobal && config.installCommand && !config.installCommand.includes("bunx")) {
        await logger.info("Attempting automatic installation...");
        try {
          // Safe installation using spawn instead of execSync
          await this.safeInstall(config, rootPath);
          await logger.info(`✅ ${config.name} Language Server installed successfully!`);
        } catch (e) {
          await logger.error(`Failed to install ${config.name} Language Server:`, e);
          return;
        }
      } else {
        return;
      }
    }

    // Start the server
    try {
      const serverProcess = spawn(config.command, config.args || [], {
        cwd: rootPath,
        env: { ...process.env, CLAUDE_LSP_PROJECT_ROOT: rootPath }
      });

      // Register the server in the database
      if (this.deduplicator && serverProcess.pid) {
        this.deduplicator.registerLanguageServer(this.projectHash, language, serverProcess.pid);
        await logger.info(`📝 Registered ${config.name} server (PID: ${serverProcess.pid})`);
      }

      serverProcess.on('error', async (err) => {
        await logger.error(`Failed to start ${config.name} server:`, err);
        // Clean up database entry on error
        if (this.deduplicator) {
          this.deduplicator.removeLanguageServer(this.projectHash, language);
        }
      });

      serverProcess.stderr?.on('data', async (data) => {
        await logger.error(`${config.name} server error:`, data.toString());
      });

      const connection = rpc.createMessageConnection(
        new rpc.StreamMessageReader(serverProcess.stdout!),
        new rpc.StreamMessageWriter(serverProcess.stdin!)
      );

      // Create server object early for Metals tracking
      const server: LSPServer = {
        process: serverProcess,
        connection,
        initialized: false,  // Will be set to true after initialization
        rootUri: `file://${resolve(rootPath)}`,
        language,
        metalsReady: language !== "scala"  // Non-Scala servers are immediately ready
      };
      
      // Handle diagnostics
      connection.onNotification("textDocument/publishDiagnostics", async (params: any) => {
        await this.handleDiagnostics(params.uri, params.diagnostics, language);
      });
      
      // Handle window/showMessageRequest (needed for Metals)
      connection.onRequest("window/showMessageRequest", async (params: any) => {
        await logger.debug(`[${config.name}] Message request: ${params.message}`);
        // Auto-respond to message requests (usually import build prompts)
        if (params.actions && params.actions.length > 0) {
          // Return the first action (usually "Import build")
          return params.actions[0];
        }
        return null;
      });
      
      // Handle client/registerCapability (Metals uses this)
      connection.onRequest("client/registerCapability", async (_params: any) => {
        await logger.debug(`[${config.name}] Registering capability`);
        return null;
      });
      
      // Track Metals readiness through log messages
      if (language === "scala") {
        connection.onNotification("window/logMessage", async (params: any) => {
          if (params.message.includes("indexed workspace") || 
              params.message.includes("compiled root")) {
            await logger.info(`[${config.name}] Metals is ready!`);
            server.metalsReady = true;  // Update the server object directly
          }
        });
      }

      // Handle workspace/configuration requests (needed for Pyright)
      connection.onRequest("workspace/configuration", (params: any) => {
        const items = params.items || [];
        const result = items.map((item: any) => {
          if (item.section === "python" && language === "python") {
            // Detect Python environment
            const venvPaths = [
              join(rootPath, "venv"),
              join(rootPath, ".venv"),
              join(rootPath, "env"),
              join(rootPath, ".env"),
            ];
            
            let pythonPath = "python3";
            for (const venvPath of venvPaths) {
              const venvPython = join(venvPath, "bin", "python");
              if (existsSync(venvPython)) {
                pythonPath = venvPython;
                break;
              }
            }
            
            return {
              pythonPath: pythonPath,
              analysis: {
                autoImportCompletions: true,
                autoSearchPaths: true,
                useLibraryCodeForTypes: true,
                typeCheckingMode: "strict",
                diagnosticMode: "openFilesOnly"
              }
            };
          }
          return {};
        });
        return result;
      });

      connection.listen();

      // Initialize the server
      const initParams: InitializeParams = {
        processId: process.pid,
        rootUri: `file://${resolve(rootPath)}`,
        capabilities: {
          textDocument: {
            synchronization: {
              dynamicRegistration: false,
              willSave: false,
              willSaveWaitUntil: false
            },
            publishDiagnostics: {
              relatedInformation: true,
              versionSupport: true,
              codeDescriptionSupport: true,
              dataSupport: true
            }
          },
          workspace: {
            didChangeConfiguration: {
              dynamicRegistration: false
            },
            workspaceFolders: true
          }
        },
        workspaceFolders: [{
          uri: `file://${resolve(rootPath)}`,
          name: "workspace"
        }],
        initializationOptions: await this.getInitializationOptions(language)
      };

      await connection.sendRequest("initialize", initParams) as any;
      await logger.info(`✅ ${config.name} server initialized`);

      // Send initialized notification
      await connection.sendNotification("initialized", {});
      
      // Mark server as initialized
      server.initialized = true;
      
      // Store the server
      this.servers.set(language, server);

      // Handle process exit to clean up database
      serverProcess.on('exit', (code, signal) => {
        if (this.deduplicator) {
          this.deduplicator.removeLanguageServer(this.projectHash, language);
          logger.info(`🗑️  Cleaned up ${config.name} server entry (exit code: ${code})`);
        }
        this.servers.delete(language);
      });
      
      // For Scala, wait for Metals to be ready
      if (language === "scala") {
        await logger.info(`Waiting for Metals to index and compile...`);
        const startTime = Date.now();
        while (!server.metalsReady && Date.now() - startTime < 60000) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        if (server.metalsReady) {
          await logger.info(`✅ Metals is ready after ${Math.round((Date.now() - startTime) / 1000)}s`);
        } else {
          await logger.warn(`⚠️ Metals initialization timeout after 60s`);
        }
      }

    } catch (error) {
      await logger.error(`Failed to start ${config.name} server:`, error);
    }
  }

  async autoDetectAndStart(rootPath: string): Promise<void> {
    await logger.info("🔍 Auto-detecting project languages...");
    const detectedLanguages = detectProjectLanguages(rootPath);
    
    if (detectedLanguages.length === 0) {
      await logger.info("No language-specific project files detected.");
      await logger.info("Will start servers based on file extensions when files are opened.");
      return;
    }

    await logger.info(`Detected languages: ${detectedLanguages.join(", ")}`);
    
    for (const language of detectedLanguages) {
      await this.startLanguageServer(language, rootPath);
    }
  }

  async openDocument(filePath: string, waitForDiagnostics: boolean = false): Promise<void> {
    const extension = extname(filePath);
    
    // Find which language server should handle this file
    let targetLanguage: string | undefined;
    for (const [lang, config] of Object.entries(languageServers)) {
      if (config.extensions.includes(extension)) {
        targetLanguage = lang;
        break;
      }
    }

    if (!targetLanguage) {
      await logger.debug(`No language server for ${extension} files`);
      return;
    }

    // Start server if not already running
    if (!this.servers.has(targetLanguage)) {
      const rootPath = resolve(process.cwd());
      await this.startLanguageServer(targetLanguage, rootPath);
    }

    const server = this.servers.get(targetLanguage);
    if (!server || !server.initialized) {
      await logger.debug(`Server not ready for ${targetLanguage}`);
      return;
    }

    // Track which language handles this file
    this.fileLanguageMap.set(filePath, targetLanguage);

    // Read file content
    const content = readFileSync(filePath, 'utf-8');
    const uri = `file://${resolve(filePath)}`;
    
    // Track document version
    this.documentVersions.set(uri, 1);

    // Send didOpen notification
    const textDocument: TextDocumentItem = {
      uri,
      languageId: this.getLanguageId(targetLanguage),
      version: 1,
      text: content
    };

    await server.connection.sendNotification("textDocument/didOpen", {
      textDocument
    });

    await logger.info(`📄 Opened ${filePath} with ${languageServers[targetLanguage].name} server`);
    
    // If requested, wait for diagnostics to be published
    if (waitForDiagnostics) {
      const resolvedPath = resolve(filePath);
      const maxWait = 50; // 5 seconds max
      let attempts = 0;
      
      while (attempts < maxWait && !this.receivedDiagnostics.has(resolvedPath)) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }
      
      if (this.receivedDiagnostics.has(resolvedPath)) {
        await logger.debug(`✅ Received diagnostics for ${filePath}`);
      } else {
        await logger.warn(`⚠️ Timeout waiting for diagnostics for ${filePath}`);
      }
    }
  }

  async updateDocument(filePath: string, newContent: string): Promise<void> {
    const targetLanguage = this.fileLanguageMap.get(filePath);
    if (!targetLanguage) {
      await logger.debug(`No language server tracking ${filePath}`);
      return;
    }

    const server = this.servers.get(targetLanguage);
    if (!server || !server.initialized) return;

    const uri = `file://${resolve(filePath)}`;
    const currentVersion = this.documentVersions.get(uri) || 1;
    const newVersion = currentVersion + 1;
    this.documentVersions.set(uri, newVersion);

    const textDocument: VersionedTextDocumentIdentifier = {
      uri,
      version: newVersion
    };

    const contentChange: TextDocumentContentChangeEvent = {
      text: newContent
    };

    await server.connection.sendNotification("textDocument/didChange", {
      textDocument,
      contentChanges: [contentChange]
    });
  }

  async closeDocument(filePath: string): Promise<void> {
    const targetLanguage = this.fileLanguageMap.get(filePath);
    if (!targetLanguage) return;

    const server = this.servers.get(targetLanguage);
    if (!server || !server.initialized) return;

    const uri = `file://${resolve(filePath)}`;
    
    await server.connection.sendNotification("textDocument/didClose", {
      textDocument: { uri }
    });

    this.fileLanguageMap.delete(filePath);
    this.documentVersions.delete(uri);
    this.diagnostics.delete(resolve(filePath));
  }

  private async handleDiagnostics(uri: string, diagnostics: Diagnostic[], language: string) {
    const filePath = decodeURIComponent(uri.replace(/^file:\/\//, ""));  // Decode URL encoding
    const resolvedPath = resolve(filePath);  // Normalize the path
    await logger.info(`[${languageServers[language].name}] Diagnostics for ${filePath}: ${diagnostics.length} issues`);
    
    // Mark that we've received diagnostics for this file
    this.receivedDiagnostics.add(resolvedPath);
    
    // For Scala/Metals, only update if we're getting real diagnostics or if we haven't received any yet
    // This prevents Metals from clearing valid diagnostics with empty updates
    if (language === "scala" && diagnostics.length === 0 && this.diagnostics.has(resolvedPath)) {
      const existing = this.diagnostics.get(resolvedPath)!;
      if (existing.length > 0) {
        await logger.debug(`  [Scala] Ignoring empty diagnostics update (keeping ${existing.length} existing diagnostics)`);
        return;
      }
    }
    
    this.diagnostics.set(resolvedPath, diagnostics);  // Store with resolved path
    
    // Log errors and warnings
    for (const diag of diagnostics) {
      const severity = this.getSeverityString(diag.severity);
      await logger.info(`  [${severity}] Line ${diag.range.start.line + 1}: ${diag.message}`);
    }
  }

  private getSeverityString(severity?: DiagnosticSeverity): string {
    switch (severity) {
      case DiagnosticSeverity.Error: return "ERROR";
      case DiagnosticSeverity.Warning: return "WARNING";
      case DiagnosticSeverity.Information: return "INFO";
      case DiagnosticSeverity.Hint: return "HINT";
      default: return "UNKNOWN";
    }
  }

  private getLanguageId(language: string): string {
    const languageIdMap: Record<string, string> = {
      typescript: "typescript",
      python: "python",
      rust: "rust",
      go: "go",
      java: "java",
      cpp: "cpp",
      ruby: "ruby",
      php: "php",
      lua: "lua",
      elixir: "elixir",
      terraform: "terraform",
      scala: "scala"
    };
    return languageIdMap[language] || language;
  }

  private async getInitializationOptions(language: string): Promise<any> {
    // Language-specific initialization options
    switch (language) {
      case "typescript":
        return {
          preferences: {
            includeInlayParameterNameHints: "all",
            includeInlayParameterNameHintsWhenArgumentMatchesName: true,
            includeInlayFunctionParameterTypeHints: true,
            includeInlayVariableTypeHints: true,
            includeInlayPropertyDeclarationTypeHints: true,
            includeInlayFunctionLikeReturnTypeHints: true,
            includeInlayEnumMemberValueHints: true
          }
        };
      case "python":
        // Pyright needs proper workspace configuration and Python environment
        const rootPath = resolve(process.cwd());
        
        // Try to detect Python environment
        const venvPaths = [
          join(rootPath, "venv"),
          join(rootPath, ".venv"),
          join(rootPath, "env"),
          join(rootPath, ".env"),
        ];
        
        let pythonPath = "python3"; // Default
        for (const venvPath of venvPaths) {
          const venvPython = join(venvPath, "bin", "python");
          if (existsSync(venvPython)) {
            pythonPath = venvPython;
            await logger.debug(`Found Python venv: ${venvPython}`);
            break;
          }
        }
        
        return {
          python: {
            pythonPath: pythonPath,
            venvPath: "",  // Let Pyright auto-detect
            analysis: {
              autoImportCompletions: true,
              autoSearchPaths: true,
              useLibraryCodeForTypes: true,
              typeCheckingMode: "strict",
              diagnosticMode: "workspace",  // Important: analyze the whole workspace
              stubPath: "",  // Use default stubs
              extraPaths: []
            }
          }
        };
      default:
        return {};
    }
  }

  getDiagnostics(filePath?: string): Diagnostic[] {
    if (filePath) {
      const resolvedPath = resolve(filePath);
      return this.diagnostics.get(resolvedPath) || [];
    }
    
    // Return all diagnostics
    const allDiagnostics: Diagnostic[] = [];
    for (const diags of this.diagnostics.values()) {
      allDiagnostics.push(...diags);
    }
    return allDiagnostics;
  }
  
  hasReceivedDiagnostics(filePath: string): boolean {
    const resolvedPath = resolve(filePath);
    return this.receivedDiagnostics.has(resolvedPath);
  }

  getAllDiagnostics(): Map<string, Diagnostic[]> {
    return new Map(this.diagnostics);
  }

  async stopLanguageServer(language: string): Promise<void> {
    const server = this.servers.get(language);
    if (!server) return;

    server.connection.dispose();
    server.process.kill();
    this.servers.delete(language);
    
    await logger.info(`Stopped ${languageServers[language].name} server`);
  }

  async stopAllServers(): Promise<void> {
    for (const [language, server] of this.servers) {
      server.connection.dispose();
      server.process.kill();
      await logger.info(`Stopped ${languageServers[language].name} server`);
    }
    this.servers.clear();
    this.diagnostics.clear();
    this.documentVersions.clear();
    this.fileLanguageMap.clear();
  }

  getActiveServers(): string[] {
    return Array.from(this.servers.keys()).map(lang => languageServers[lang].name);
  }

  getActiveLanguageKeys(): string[] {
    return Array.from(this.servers.keys());
  }

  clearDiagnostics(): void {
    this.diagnostics.clear();
    this.receivedDiagnostics.clear();
  }

  async restartServers(): Promise<void> {
    // Get active languages before stopping servers
    const activeLanguages = Array.from(this.servers.keys());
    
    // Stop all current servers
    await this.stopAllServers();
    
    // Wait a moment for cleanup
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Restart servers for the same languages (they'll be auto-started when files are opened)
    await logger.info(`Reset completed for languages: ${activeLanguages.join(', ')}`);
  }

  getActiveFileExtensions(): string[] {
    const extensions = new Set<string>();
    for (const lang of this.servers.keys()) {
      const config = languageServers[lang];
      if (config?.extensions) {
        config.extensions.forEach(ext => extensions.add(ext));
      }
    }
    return Array.from(extensions);
  }

  getSupportedLanguages(): string[] {
    return Object.keys(languageServers);
  }

  // Alias for stopAllServers to match test expectations
  async shutdown(): Promise<void> {
    return this.stopAllServers();
  }
}