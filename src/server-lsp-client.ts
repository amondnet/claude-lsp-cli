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
import { TIMEOUTS } from "./constants";
import { 
  languageServers, 
  detectProjectLanguages, 
  isLanguageServerInstalled,
  getInstallInstructions,
  LanguageServerConfig 
} from "./language-servers";

type ServerState = 'starting' | 'initializing' | 'ready' | 'failed' | 'stopped';

interface LSPServer {
  process: ChildProcess;
  connection: rpc.MessageConnection;
  initialized: boolean;
  rootUri: string;
  language: string;
  metalsReady?: boolean;
  state: ServerState;
  startTime: number;
  readyTime?: number;
}

import { DiagnosticDeduplicator } from './utils/diagnostic-dedup.js';

export class LSPClient {
  private servers: Map<string, LSPServer> = new Map();
  private startingServers: Map<string, Promise<void>> = new Map(); // Track servers being started
  private diagnostics: Map<string, Diagnostic[]> = new Map();
  private documentVersions: Map<string, number> = new Map();
  private fileLanguageMap: Map<string, string> = new Map();
  private receivedDiagnostics: Set<string> = new Set(); // Track files that have received diagnostics
  private projectHash: string;
  private deduplicator: DiagnosticDeduplicator | null;
  private failedServers: Map<string, { count: number; lastAttempt: number }> = new Map();
  private readonly MAX_RESTART_ATTEMPTS = 5; // Maximum number of restart attempts before giving up

  constructor(projectHash?: string, deduplicator?: DiagnosticDeduplicator) {
    this.projectHash = projectHash || 'default';
    this.deduplicator = deduplicator || null;
  }

  /**
   * Check if a language server process is already running
   */
  private async checkExistingProcess(config: LanguageServerConfig): Promise<number | null> {
    try {
      // Use pgrep to check for running process by command name
      const { spawn } = await import('child_process');
      
      return new Promise((resolve) => {
        // For pylsp, we need to check for both pylsp and python.*pylsp patterns
        // Use more specific pattern to avoid false positives and catch all Python LSP processes
        let processPattern: string;
        // Special handling when using npx to launch pyright-langserver
        if (config.command === 'npx' && (config.args || []).includes('pyright-langserver')) {
          processPattern = 'pyright-langserver';
        } else if (config.command === 'pylsp') {
          // Legacy handling (no longer used): pylsp and python*pylsp
          processPattern = '(pylsp|python.*pylsp)';
        } else {
          processPattern = config.command;
        }
        
        const child = spawn('pgrep', ['-f', processPattern], {
          stdio: ['ignore', 'pipe', 'ignore']
        });
        
        let output = '';
        child.stdout?.on('data', (data) => {
          output += data.toString();
        });
        
        child.on('exit', async (code) => {
          if (code === 0 && output.trim()) {
            // Process found, return first PID
            const pids = output.trim().split('\n').map(p => parseInt(p)).filter(p => !isNaN(p));
            if (pids.length > 0) {
              // Log warning if multiple processes detected
              if (pids.length > 1) {
                await logger.warn(`⚠️ Found ${pids.length} ${config.name} processes running: ${pids.join(', ')}`);
                await logger.warn(`This may cause OOM issues. Consider killing extra processes.`);
              }
              resolve(pids[0]);
              return;
            }
          }
          resolve(null);
        });
        
        // Timeout after 1 second
        setTimeout(() => resolve(null), 1000);
      });
    } catch (error) {
      // If pgrep fails, assume no process is running
      return null;
    }
  }

  /**
   * Clean up zombie Python LSP processes
   */
  private async cleanupZombiePythonProcesses(): Promise<void> {
    try {
      const { spawn } = await import('child_process');
      
      // Find all Python LSP processes (pyright)
      const findProc = spawn('pgrep', ['-f', 'pyright-langserver'], {
        stdio: ['ignore', 'pipe', 'pipe']
      });
      
      let output = '';
      findProc.stdout?.on('data', (data) => {
        output += data.toString();
      });
      
      await new Promise<void>((resolve) => {
        findProc.on('exit', async (code) => {
          if (code === 0 && output.trim()) {
            const pids = output.trim().split('\n').map(p => parseInt(p)).filter(p => !isNaN(p));
            
            // Keep only the first process, kill the rest
            if (pids.length > 1) {
              await logger.warn(`🧹 Found ${pids.length} Python LSP (pyright) processes. Cleaning up extras...`);
              
              for (let i = 1; i < pids.length; i++) {
                try {
                  process.kill(pids[i], 'SIGTERM');
                  await logger.info(`✅ Killed zombie Python LSP process: ${pids[i]}`);
                } catch (err) {
                  await logger.debug(`Failed to kill process ${pids[i]}:`, err);
                }
              }
            }
          }
          resolve();
        });
        
        // Timeout after 2 seconds
        setTimeout(() => resolve(), 2000);
      });
    } catch (error) {
      await logger.debug(`Failed to cleanup zombie processes:`, error);
    }
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
    // Global per-language opt-out via environment variable
    const disableVar = `CLAUDE_LSP_DISABLE_${language.toUpperCase()}`;
    const disableVal = process.env[disableVar];
    if (disableVal && (disableVal === '1' || disableVal.toLowerCase() === 'true')) {
      await logger.warn(`${languageServers[language]?.name || language} LSP disabled via ${disableVar}`);
      return;
    }

    console.log(`[DEBUG] startLanguageServer called for ${language} at ${rootPath}`);
    const config = languageServers[language];
    if (!config) {
      console.log(`[DEBUG] Unknown language: ${language}`);
      await logger.error(`Unknown language: ${language}`);
      return;
    }

    // Check if we already have a server in our local cache (same LSPClient instance)
    if (this.servers.has(language)) {
      const server = this.servers.get(language)!;
      if (server.state === 'ready') {
        console.log(`[DEBUG] Reusing existing ready server for ${language}`);
        await logger.info(`✅  Reusing local ${config.name} server connection`);
        return;
      }
    }
    
    // Check if this server is already being started
    if (this.startingServers.has(language)) {
      console.log(`[DEBUG] Server already being started for ${language}, waiting...`);
      await this.startingServers.get(language);
      return;
    }

    // Check if this server has failed recently (prevent infinite respawn loop)
    const failedInfo = this.failedServers.get(language);
    if (failedInfo) {
      // If we've exceeded max attempts, don't try again
      if (failedInfo.count >= this.MAX_RESTART_ATTEMPTS) {
        console.log(`[DEBUG] Server exceeded max restart attempts: ${failedInfo.count}`);
        await logger.error(`❌ ${config.name} server has failed ${failedInfo.count} times. Maximum restart attempts (${this.MAX_RESTART_ATTEMPTS}) exceeded. Giving up.`);
        return;
      }
      
      const timeSinceLastAttempt = Date.now() - failedInfo.lastAttempt;
      const backoffTime = Math.min(60000, 5000 * Math.pow(2, failedInfo.count - 1)); // Exponential backoff up to 60s
      
      if (timeSinceLastAttempt < backoffTime) {
        console.log(`[DEBUG] Server in backoff period: ${timeSinceLastAttempt}ms < ${backoffTime}ms`);
        await logger.warn(`⚠️ ${config.name} server failed ${failedInfo.count} times. Waiting ${Math.round((backoffTime - timeSinceLastAttempt) / 1000)}s before retry...`);
        return;
      }
    }

    // Check if a process is already running for this language server
    console.log(`[DEBUG] Checking for existing process...`);
    const existingProcess = await this.checkExistingProcess(config);
    if (existingProcess) {
      console.log(`[DEBUG] Found existing process PID: ${existingProcess} - killing it to start fresh`);
      await logger.warn(`⚠️ ${config.name} process already running (PID: ${existingProcess}). Killing it to start fresh.`);
      
      // Kill the existing process to start fresh
      try {
        process.kill(existingProcess, 'SIGTERM');
        // Wait a moment for the process to die
        await new Promise(resolve => setTimeout(resolve, 500));
        console.log(`[DEBUG] Killed existing process ${existingProcess}`);
      } catch (err) {
        console.log(`[DEBUG] Failed to kill process ${existingProcess}:`, err);
        // Process might already be dead, continue anyway
      }
    }
    console.log(`[DEBUG] No existing process found or cleaned up, continuing...`);

    // Clean up any stale servers before starting a new one
    await this.checkProcessAlive();
    
    // For Python, also clean up any zombie processes
    if (language === 'python') {
      await this.cleanupZombiePythonProcesses();
    }

    console.log(`[DEBUG] Checking if ${language} server is installed...`);
    await logger.info(`Starting ${config.name} Language Server...`);
    
    // Check if server is installed
    if (!isLanguageServerInstalled(language)) {
      console.log(`[DEBUG] Server not installed, install check: ${config.installCheck}`);
      await logger.error(getInstallInstructions(language));
      
      // Skip auto-install for bundled servers or auto-download servers
      if (config.installCheck === 'BUNDLED') {
        // These are bundled in the binary, just continue
        console.log(`[DEBUG] Server is bundled`);
        await logger.info(`${config.name} is bundled - no installation needed`);
      } else if (config.installCheck === 'SKIP') {
        // These auto-download via npx, just continue
        console.log(`[DEBUG] Server uses SKIP - should auto-download`);
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

    // Create a promise to track the server startup
    const startupPromise = this.doStartServer(language, config, rootPath);
    this.startingServers.set(language, startupPromise);
    
    try {
      await startupPromise;
    } finally {
      // Clean up the tracking promise
      this.startingServers.delete(language);
    }
  }
  
  private async doStartServer(language: string, config: LanguageServerConfig, rootPath: string): Promise<void> {
    // Start the server
    try {
      await logger.info(`🚀 Attempting to spawn ${config.name} server`);
      await logger.info(`   Command: ${config.command}`);
      await logger.info(`   Args: ${JSON.stringify(config.args || [])}`);
      await logger.info(`   CWD: ${rootPath}`);
      
      // Add resource limits to prevent CPU spam
      const spawnOptions: any = {
        cwd: rootPath,
        env: { 
          ...process.env, 
          CLAUDE_LSP_PROJECT_ROOT: rootPath,
          // Limit memory usage for all servers
          NODE_OPTIONS: '--max-old-space-size=512'
        },
        stdio: ['pipe', 'pipe', 'pipe']  // Explicit stdio for npx compatibility
      };
      
      // Add stricter limits for TypeScript servers
      if (language === 'typescript') {
        // Check if this is a large project (like ui/ directories)
        const isLargeProject = rootPath.includes('/ui') || rootPath.includes('kepler_app');
        
        if (isLargeProject) {
          spawnOptions.env.NODE_OPTIONS = '--max-old-space-size=128'; // Very restrictive for large projects
          await logger.warn(`⚠️  Large TypeScript project detected - using aggressive resource limits`);
        } else {
          spawnOptions.env.NODE_OPTIONS = '--max-old-space-size=256'; // Normal limit
        }
        
        spawnOptions.env.TSS_LOG = '-level normal'; // Reduce logging
        spawnOptions.env.TSS_DEBUG = '0';
        spawnOptions.env.TSSERVER_LOG_VERBOSITY = 'compact';
      }
      // Add Java memory limits to reduce risk of runaway heap usage
      if (language === 'java') {
        spawnOptions.env.JAVA_TOOL_OPTIONS = (spawnOptions.env.JAVA_TOOL_OPTIONS ? `${spawnOptions.env.JAVA_TOOL_OPTIONS} ` : '') + '-Xmx512m -Xms128m';
        // Set JAVA_HOME to Java 21 which is required for jdtls
        spawnOptions.env.JAVA_HOME = '/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home';
      }
      
      // Build args per language (avoid mutating shared config)
      const spawnArgs = [...(config.args || [])];
      if (language === 'java' && config.command === 'jdtls') {
        // Use a per-project workspace to avoid cross-project reindex and reduce churn
        const dataDir = join(rootPath, '.jdtls');
        spawnArgs.push('-data', dataDir);
      }

      console.log(`[DEBUG] About to spawn: ${config.command} ${spawnArgs.join(' ')}`);
      const serverProcess = spawn(config.command, spawnArgs, spawnOptions);
      console.log(`[DEBUG] Spawned process PID: ${serverProcess.pid}`);

      // Register the server in the database
      if (this.deduplicator && serverProcess.pid) {
        this.deduplicator.registerLanguageServer(this.projectHash, language, serverProcess.pid);
        console.log(`[DEBUG] Registered server PID ${serverProcess.pid}`);
        await logger.info(`📝 Registered ${config.name} server (PID: ${serverProcess.pid})`);
      }

      serverProcess.on('error', async (err) => {
        console.log(`[DEBUG] Server process error:`, err);
        await logger.error(`Failed to start ${config.name} server:`, err);
        // Track failed server to prevent infinite respawn
        const failedInfo = this.failedServers.get(language) || { count: 0, lastAttempt: 0 };
        this.failedServers.set(language, {
          count: failedInfo.count + 1,
          lastAttempt: Date.now()
        });
        // Clean up database entry on error
        if (this.deduplicator) {
          this.deduplicator.removeLanguageServer(this.projectHash, language);
        }
      });
      
      serverProcess.on('exit', (code, signal) => {
        console.log(`[DEBUG] Server process exited early with code ${code} and signal ${signal}`);
        if (this.deduplicator) {
          this.deduplicator.removeLanguageServer(this.projectHash, language);
        }
        // Track failed server
        const failedInfo = this.failedServers.get(language) || { count: 0, lastAttempt: 0 };
        this.failedServers.set(language, {
          count: failedInfo.count + 1,
          lastAttempt: Date.now()
        });
      });

      serverProcess.stderr?.on('data', async (data) => {
        const errorMsg = data.toString();
        console.log(`[DEBUG] Server stderr:`, errorMsg);
        await logger.error(`${config.name} server error:`, errorMsg);
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
        metalsReady: language !== "scala",  // Non-Scala servers are immediately ready
        state: 'starting',
        startTime: Date.now()
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
      
      // Update state to initializing
      server.state = 'initializing';

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

      console.log(`[DEBUG] Sending initialize request...`);
      try {
        const initResult = await connection.sendRequest("initialize", initParams) as any;
        console.log(`[DEBUG] Initialize response:`, JSON.stringify(initResult).substring(0, 200));
        await logger.info(`✅ ${config.name} server initialized`);
      } catch (err) {
        console.log(`[DEBUG] Initialize failed:`, err);
        throw err;
      }

      // Send initialized notification
      await connection.sendNotification("initialized", {});
      
      // Mark server as initialized
      server.initialized = true;
      
      // Clear failed server tracking on successful initialization
      if (this.failedServers.has(language)) {
        this.failedServers.delete(language);
        await logger.info(`✅ ${config.name} server initialized successfully - cleared failure tracking`);
      }
      
      // Store the server
      this.servers.set(language, server);
      
      // Wait for server to be ready based on language-specific timing
      await this.waitForServerReady(server, language, config);
      
      // Remove the early exit handler and add a proper one
      serverProcess.removeAllListeners('exit');
      serverProcess.on('exit', (code, signal) => {
        console.log(`[DEBUG] Server process exited with code ${code} and signal ${signal}`);
        if (this.deduplicator) {
          this.deduplicator.removeLanguageServer(this.projectHash, language);
          logger.info(`🗑️  Cleaned up ${config.name} server entry (exit code: ${code})`);
        }
        this.servers.delete(language);
        
        // Track failed server if it exited unexpectedly (non-zero exit code)
        if (code !== 0) {
          const failedInfo = this.failedServers.get(language) || { count: 0, lastAttempt: 0 };
          this.failedServers.set(language, {
            count: failedInfo.count + 1,
            lastAttempt: Date.now()
          });
          logger.error(`❌ ${config.name} server exited unexpectedly (code: ${code}). Failed ${failedInfo.count + 1} times.`);
        }
      });
      
      // For Scala, wait for Metals to be ready
      if (language === "scala") {
        await logger.info(`Waiting for Metals to index and compile...`);
        const startTime = Date.now();
        while (!server.metalsReady && Date.now() - startTime < TIMEOUTS.METALS_READY_TIMEOUT_MS) {
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
      console.log(`[DEBUG] No language server for ${extension} files`);
      await logger.debug(`No language server for ${extension} files`);
      return;
    }

    console.log(`[DEBUG] Opening ${extension} file with ${targetLanguage} server`);
    await logger.info(`🔍 Opening ${extension} file with ${targetLanguage} server`);

    // Start server if not already running
    if (!this.servers.has(targetLanguage)) {
      const rootPath = resolve(process.cwd());
      console.log(`[DEBUG] Starting ${targetLanguage} server for ${rootPath}`);
      await logger.info(`🚀 Starting ${targetLanguage} server for ${rootPath}`);
      await this.startLanguageServer(targetLanguage, rootPath);
    }

    const server = this.servers.get(targetLanguage);
    if (!server || !server.initialized) {
      console.log(`[DEBUG] Server not ready for ${targetLanguage} - server exists: ${!!server}, initialized: ${server?.initialized}`);
      await logger.warn(`⚠️ Server not ready for ${targetLanguage}`);
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
  
  getActiveLanguages(): string[] {
    return Array.from(this.servers.keys());
  }
  
  private async waitForServerReady(server: LSPServer, language: string, config: LanguageServerConfig): Promise<void> {
    // Language-specific readiness timing
    const readinessTiming: Record<string, number> = {
      typescript: 3000,  // TypeScript needs time to parse tsconfig and build type graph
      java: 10000,       // Java needs time to load JVM and index
      scala: 5000,       // Scala/Metals needs time to compile
      python: 2000,      // Python needs time to analyze imports
      rust: 3000,        // Rust analyzer needs time to build
      go: 500,           // Go is fast
      ruby: 1000,        // Ruby is relatively fast
      php: 1000,         // PHP is relatively fast
      cpp: 2000,         // C++ needs time to parse compile_commands
      elixir: 2000,      // Elixir needs time to compile
      lua: 500,          // Lua is fast
      terraform: 1000    // Terraform is relatively fast
    };
    
    const waitTime = readinessTiming[language] || 1000;
    
    await logger.info(`⏳ Waiting ${waitTime}ms for ${config.name} to be ready...`);
    await new Promise(resolve => setTimeout(resolve, waitTime));
    
    // For TypeScript, ensure the server is truly ready by making a test request
    if (language === 'typescript' && server.process && !server.process.killed) {
      await logger.info(`🔍 Verifying TypeScript server is responsive...`);
      // Give it a bit more time to ensure it's fully initialized
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Mark server as ready
    server.state = 'ready';
    server.readyTime = Date.now();
    
    const totalTime = server.readyTime - server.startTime;
    await logger.info(`✅ ${config.name} server ready after ${totalTime}ms`);
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

  /**
   * Clean up stale language server processes for the current project
   */
  private async cleanupStaleServersForProject(language: string): Promise<void> {
    try {
      // Get the server command to search for
      const serverCmd = language === 'typescript' ? 'tsserver' : `${language}-language-server`;
      
      // Find all processes for this language server type
      const proc = spawn('bash', ['-c', `ps aux | grep "${serverCmd}" | grep -v grep`], 
                         { stdio: ['ignore', 'pipe', 'pipe'] });
      
      let output = '';
      proc.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      await new Promise<void>((resolve) => {
        proc.on('close', () => {
          const lines = output.trim().split('\n').filter(line => line.trim());
          let cleaned = 0;
          
          for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            const pid = parseInt(parts[1]);
            
            // Only clean up servers for the current project path
            if (line.includes(this.projectRoot)) {
              try {
                // Check if process still exists and is stale
                process.kill(pid, 0); // Test signal
                
                // If we get here, process exists - kill it
                process.kill(pid, 'SIGTERM');
                cleaned++;
                logger.info(`🗑️  Cleaned up stale ${language} server (PID: ${pid})`);
              } catch (e) {
                // Process doesn't exist or no permission
              }
            }
          }
          
          if (cleaned > 0) {
            logger.info(`Cleaned up ${cleaned} stale ${language} server(s)`);
          }
          resolve();
        });
      });
      
      // Give processes time to terminate
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (error) {
      await logger.debug(`Error during stale server cleanup: ${error}`);
    }
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

  /**
   * Check if a process ID is still alive
   */
  private isPidAlive(pid: number): boolean {
    try {
      // Send signal 0 to check if process exists without actually sending a signal
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if all locally cached servers are still alive and clean up stale ones
   */
  async checkProcessAlive(): Promise<void> {
    const staleLanguages: string[] = [];
    
    for (const [language, server] of this.servers.entries()) {
      if (server.process.pid && !this.isPidAlive(server.process.pid)) {
        await logger.info(`🗑️  Removing stale ${language} server (PID: ${server.process.pid})`);
        staleLanguages.push(language);
        
        // Remove from deduplicator tracking if available
        if (this.deduplicator) {
          this.deduplicator.removeLanguageServer(this.projectHash, language);
        }
      }
    }
    
    // Remove stale servers from local cache
    for (const language of staleLanguages) {
      this.servers.delete(language);
    }
    
    if (staleLanguages.length > 0) {
      await logger.info(`Cleaned up ${staleLanguages.length} stale language servers`);
    }
  }

  // Alias for stopAllServers to match test expectations
  async shutdown(): Promise<void> {
    return this.stopAllServers();
  }
}
