/**
 * Mock implementations for testing various CLI components
 */

import { mock, spyOn } from 'bun:test';
import type { DiagnosticResult } from './diagnostic-results';
import type { LspConfig } from './config-data';

/**
 * File system operation mocks
 */
export class MockFileSystem {
  private files: Map<string, string> = new Map();
  private directories: Set<string> = new Set();

  // Mock file contents
  setFile(path: string, content: string): void {
    this.files.set(path, content);
    // Automatically create parent directories
    const dir = path.substring(0, path.lastIndexOf('/'));
    if (dir) {
      this.directories.add(dir);
    }
  }

  // Mock directory existence
  setDirectory(path: string): void {
    this.directories.add(path);
  }

  // Check if file exists
  hasFile(path: string): boolean {
    return this.files.has(path);
  }

  // Check if directory exists
  hasDirectory(path: string): boolean {
    return this.directories.has(path);
  }

  // Get file content
  getFile(path: string): string | undefined {
    return this.files.get(path);
  }

  // Clear all mock data
  clear(): void {
    this.files.clear();
    this.directories.clear();
  }

  // Get all files
  getAllFiles(): string[] {
    return Array.from(this.files.keys());
  }
}

/**
 * Process execution mocks
 */
export interface MockProcessResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export class MockProcessExecutor {
  private commandResults: Map<string, MockProcessResult> = new Map();
  private commandHistory: string[] = [];

  // Set expected result for a command
  setCommandResult(command: string, result: MockProcessResult): void {
    this.commandResults.set(command, result);
  }

  // Execute a mocked command
  executeCommand(command: string): MockProcessResult {
    this.commandHistory.push(command);

    const result = this.commandResults.get(command);
    if (result) {
      return result;
    }

    // Default successful execution
    return {
      stdout: '',
      stderr: '',
      exitCode: 0,
    };
  }

  // Get command execution history
  getCommandHistory(): string[] {
    return [...this.commandHistory];
  }

  // Check if command was executed
  wasCommandExecuted(command: string): boolean {
    return this.commandHistory.includes(command);
  }

  // Clear all mock data
  clear(): void {
    this.commandResults.clear();
    this.commandHistory.length = 0;
  }
}

/**
 * Configuration management mocks
 */
export class MockConfigManager {
  private config: LspConfig = {};
  private configPath: string = '';

  constructor(initialConfig: LspConfig = {}) {
    this.config = { ...initialConfig };
  }

  // Mock config loading
  loadConfig(path?: string): LspConfig {
    if (path) {
      this.configPath = path;
    }
    return { ...this.config };
  }

  // Mock config saving
  saveConfig(config: LspConfig, path?: string): void {
    this.config = { ...config };
    if (path) {
      this.configPath = path;
    }
  }

  // Get current config
  getConfig(): LspConfig {
    return { ...this.config };
  }

  // Get config path
  getConfigPath(): string {
    return this.configPath;
  }

  // Check if language is disabled
  isLanguageDisabled(language: string): boolean {
    return this.config.disabled?.includes(language) || false;
  }

  // Mock config path resolution
  getDefaultConfigPath(): string {
    return '/mock/home/.claude/lsp-config.json';
  }

  // Clear mock data
  clear(): void {
    this.config = {};
    this.configPath = '';
  }
}

/**
 * Language tool checker mocks
 */
export class MockLanguageChecker {
  private results: Map<string, DiagnosticResult | null> = new Map();
  private errors: Map<string, Error> = new Map();

  // Set diagnostic result for a file
  setResult(filePath: string, result: DiagnosticResult | null): void {
    this.results.set(filePath, result);
  }

  // Set error for a file
  setError(filePath: string, error: Error): void {
    this.errors.set(filePath, error);
  }

  // Mock file checking
  async checkFile(filePath: string): Promise<DiagnosticResult | null> {
    // Check if there's a mocked error
    const error = this.errors.get(filePath);
    if (error) {
      throw error;
    }

    // Return mocked result
    const result = this.results.get(filePath);
    return result !== undefined ? result : null;
  }

  // Check if file was checked
  wasFileChecked(filePath: string): boolean {
    return this.results.has(filePath) || this.errors.has(filePath);
  }

  // Clear all mock data
  clear(): void {
    this.results.clear();
    this.errors.clear();
  }

  // Get all checked files
  getCheckedFiles(): string[] {
    return [...new Set([...this.results.keys(), ...this.errors.keys()])];
  }
}

/**
 * Deduplication system mocks
 */
export class MockDeduplicationManager {
  private seenResults: Map<string, number> = new Map();
  private shouldShowMap: Map<string, boolean> = new Map();

  // Mock shouldShowResult
  shouldShowResult(filePath: string, diagnosticCount: number): boolean {
    const key = `${filePath}:${diagnosticCount}`;
    const shouldShow = this.shouldShowMap.get(key);
    return shouldShow !== undefined ? shouldShow : true;
  }

  // Mock markResultShown
  markResultShown(filePath: string, diagnosticCount: number): void {
    const key = `${filePath}:${diagnosticCount}`;
    this.seenResults.set(key, Date.now());
  }

  // Set whether result should be shown
  setShouldShow(filePath: string, diagnosticCount: number, shouldShow: boolean): void {
    const key = `${filePath}:${diagnosticCount}`;
    this.shouldShowMap.set(key, shouldShow);
  }

  // Check if result was marked as shown
  wasMarkedShown(filePath: string, diagnosticCount: number): boolean {
    const key = `${filePath}:${diagnosticCount}`;
    return this.seenResults.has(key);
  }

  // Clear all mock data
  clear(): void {
    this.seenResults.clear();
    this.shouldShowMap.clear();
  }
}

/**
 * Console output capture for testing
 */
export class MockConsoleCapture {
  public stdout: string[] = [];
  public stderr: string[] = [];
  private originalConsole: any = {};

  // Start capturing console output
  start(): void {
    this.originalConsole.log = console.log;
    this.originalConsole.error = console.error;
    this.originalConsole.warn = console.warn;
    this.originalConsole.info = console.info;

    console.log = mock((...args: any[]) => {
      this.stdout.push(args.map((arg) => String(arg)).join(' '));
    });

    console.error = mock((...args: any[]) => {
      this.stderr.push(args.map((arg) => String(arg)).join(' '));
    });

    console.warn = mock((...args: any[]) => {
      this.stderr.push(args.map((arg) => String(arg)).join(' '));
    });

    console.info = mock((...args: any[]) => {
      this.stdout.push(args.map((arg) => String(arg)).join(' '));
    });
  }

  // Stop capturing and restore original console
  stop(): void {
    console.log = this.originalConsole.log;
    console.error = this.originalConsole.error;
    console.warn = this.originalConsole.warn;
    console.info = this.originalConsole.info;
  }

  // Get all stdout as single string
  getStdout(): string {
    return this.stdout.join('\n');
  }

  // Get all stderr as single string
  getStderr(): string {
    return this.stderr.join('\n');
  }

  // Check if stdout contains text
  stdoutContains(text: string): boolean {
    return this.getStdout().includes(text);
  }

  // Check if stderr contains text
  stderrContains(text: string): boolean {
    return this.getStderr().includes(text);
  }

  // Clear captured output
  clear(): void {
    this.stdout.length = 0;
    this.stderr.length = 0;
  }
}

/**
 * Environment variable mocks
 */
export class MockEnvironment {
  private originalEnv: Record<string, string | undefined> = {};
  private mockEnv: Record<string, string> = {};

  // Set environment variable
  set(key: string, value: string): void {
    if (!(key in this.originalEnv)) {
      this.originalEnv[key] = process.env[key];
    }
    this.mockEnv[key] = value;
    process.env[key] = value;
  }

  // Unset environment variable
  unset(key: string): void {
    if (!(key in this.originalEnv)) {
      this.originalEnv[key] = process.env[key];
    }
    delete this.mockEnv[key];
    delete process.env[key];
  }

  // Set multiple environment variables
  setAll(env: Record<string, string>): void {
    Object.entries(env).forEach(([key, value]) => {
      this.set(key, value);
    });
  }

  // Restore original environment
  restore(): void {
    Object.entries(this.originalEnv).forEach(([key, value]) => {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    });
    this.originalEnv = {};
    this.mockEnv = {};
  }

  // Get current mock environment
  getMockEnv(): Record<string, string> {
    return { ...this.mockEnv };
  }
}

/**
 * Hook data parser mocks
 */
export class MockHookDataParser {
  private mockData: any = null;
  private shouldThrowError: boolean = false;
  private errorToThrow: Error | null = null;

  // Set data to return when parsing
  setMockData(data: any): void {
    this.mockData = data;
    this.shouldThrowError = false;
    this.errorToThrow = null;
  }

  // Set error to throw when parsing
  setError(error: Error): void {
    this.errorToThrow = error;
    this.shouldThrowError = true;
    this.mockData = null;
  }

  // Mock parse function
  parse(_input: string): any {
    if (this.shouldThrowError && this.errorToThrow) {
      throw this.errorToThrow;
    }
    return this.mockData;
  }

  // Clear mock data
  clear(): void {
    this.mockData = null;
    this.shouldThrowError = false;
    this.errorToThrow = null;
  }
}

/**
 * Utility functions for creating common mocks
 */
export const mockUtils = {
  // Create a mock function that returns specific values
  createMockFunction<T = any>(returnValue: T): any {
    return mock(() => returnValue);
  },

  // Create a mock function that throws an error
  createErrorMockFunction(error: Error): any {
    return mock(() => {
      throw error;
    });
  },

  // Create a mock async function
  createAsyncMockFunction<T = any>(returnValue: T): any {
    return mock(async () => returnValue);
  },

  // Create a spy on an object method
  createSpy<T extends object, K extends keyof T>(
    object: T,
    method: K,
    implementation?: (..._args: any[]) => any
  ): any {
    const spy = spyOn(object, method);
    if (implementation) {
      spy.mockImplementation(implementation);
    }
    return spy;
  },

  // Reset all mocks (for use in afterEach)
  resetAllMocks(): void {
    // Note: This would typically call jest.clearAllMocks() or similar
    // For Bun test, we might need to implement mock tracking
  },
};

/**
 * Test helper to create temporary test environment
 */
export class TestEnvironment {
  private filesystem = new MockFileSystem();
  private processExecutor = new MockProcessExecutor();
  private configManager = new MockConfigManager();
  private languageChecker = new MockLanguageChecker();
  private deduplicationManager = new MockDeduplicationManager();
  private consoleCapture = new MockConsoleCapture();
  private environment = new MockEnvironment();
  private hookDataParser = new MockHookDataParser();

  // Get all mock components
  get mocks() {
    return {
      filesystem: this.filesystem,
      processExecutor: this.processExecutor,
      configManager: this.configManager,
      languageChecker: this.languageChecker,
      deduplicationManager: this.deduplicationManager,
      consoleCapture: this.consoleCapture,
      environment: this.environment,
      hookDataParser: this.hookDataParser,
    };
  }

  // Setup test environment
  setup(): void {
    this.consoleCapture.start();
  }

  // Cleanup test environment
  cleanup(): void {
    this.filesystem.clear();
    this.processExecutor.clear();
    this.configManager.clear();
    this.languageChecker.clear();
    this.deduplicationManager.clear();
    this.consoleCapture.stop();
    this.consoleCapture.clear();
    this.environment.restore();
    this.hookDataParser.clear();
  }

  // Quick setup for common test scenarios
  setupTypescriptProject(): void {
    this.filesystem.setFile('/project/src/index.ts', 'console.log("Hello");');
    this.filesystem.setFile('/project/package.json', '{"name": "test", "version": "1.0.0"}');
    this.filesystem.setFile('/project/tsconfig.json', '{"compilerOptions": {"strict": true}}');
    this.filesystem.setDirectory('/project');
    this.filesystem.setDirectory('/project/src');
  }

  setupPythonProject(): void {
    this.filesystem.setFile('/project/main.py', 'print("Hello, World!")');
    this.filesystem.setFile('/project/requirements.txt', 'requests>=2.25.0');
    this.filesystem.setDirectory('/project');
  }

  setupMultiLanguageProject(): void {
    this.setupTypescriptProject();
    this.setupPythonProject();
    this.filesystem.setFile('/project/main.go', 'package main\nfunc main() { println("Hello") }');
  }
}
