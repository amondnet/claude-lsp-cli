/**
 * Test utilities and helper functions for consistent test setup
 */

import { join } from 'path';
import { existsSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import type { DiagnosticResult } from './diagnostic-results';
import type { HookEvent } from './hook-data';
import type { LspConfig } from './config-data';

/**
 * Temporary directory management for tests
 */
export class TempDirectory {
  private basePath: string;
  private created: Set<string> = new Set();

  constructor(prefix: string = 'claude-lsp-test') {
    this.basePath = join(tmpdir(), `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    if (!existsSync(this.basePath)) {
      mkdirSync(this.basePath, { recursive: true });
    }
  }

  // Create a file with content
  createFile(relativePath: string, content: string): string {
    const fullPath = join(this.basePath, relativePath);
    const dir = join(fullPath, '..');
    
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    
    writeFileSync(fullPath, content);
    this.created.add(fullPath);
    return fullPath;
  }

  // Create a directory
  createDirectory(relativePath: string): string {
    const fullPath = join(this.basePath, relativePath);
    if (!existsSync(fullPath)) {
      mkdirSync(fullPath, { recursive: true });
    }
    this.created.add(fullPath);
    return fullPath;
  }

  // Get absolute path
  getPath(relativePath: string = ''): string {
    return join(this.basePath, relativePath);
  }

  // Read file content
  readFile(relativePath: string): string {
    const fullPath = join(this.basePath, relativePath);
    return readFileSync(fullPath, 'utf-8');
  }

  // Check if file exists
  exists(relativePath: string): boolean {
    const fullPath = join(this.basePath, relativePath);
    return existsSync(fullPath);
  }

  // Get base path
  getBasePath(): string {
    return this.basePath;
  }

  // Cleanup all created files and directories
  cleanup(): void {
    if (existsSync(this.basePath)) {
      rmSync(this.basePath, { recursive: true, force: true });
    }
    this.created.clear();
  }

  // List all files in the temporary directory
  listFiles(relativePath: string = ''): string[] {
    const fullPath = join(this.basePath, relativePath);
    if (!existsSync(fullPath)) {
      return [];
    }
    
    const items = [];
    const entries = require('fs').readdirSync(fullPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const itemPath = join(relativePath, entry.name);
      if (entry.isFile()) {
        items.push(itemPath);
      } else if (entry.isDirectory()) {
        items.push(...this.listFiles(itemPath));
      }
    }
    
    return items;
  }
}

/**
 * Async utilities for test timing and delays
 */
export const asyncUtils = {
  // Sleep for specified milliseconds
  sleep: (ms: number): Promise<void> => 
    new Promise(resolve => setTimeout(resolve, ms)),

  // Wait for condition to be true with timeout
  waitFor: async (
    condition: () => boolean | Promise<boolean>,
    timeout: number = 5000,
    interval: number = 100
  ): Promise<void> => {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      if (await condition()) {
        return;
      }
      await asyncUtils.sleep(interval);
    }
    
    throw new Error(`Condition not met within ${timeout}ms`);
  },

  // Race a promise against a timeout
  withTimeout: async <T>(
    promise: Promise<T>,
    timeout: number,
    errorMessage: string = 'Operation timed out'
  ): Promise<T> => {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(errorMessage)), timeout);
    });
    
    return Promise.race([promise, timeoutPromise]);
  }
};

/**
 * Assertion helpers for common test patterns
 */
export const assertions = {
  // Assert diagnostic result structure
  isValidDiagnosticResult: (result: any): result is DiagnosticResult => {
    return (
      typeof result === 'object' &&
      result !== null &&
      typeof result.language === 'string' &&
      typeof result.diagnosticCount === 'number' &&
      typeof result.summary === 'string' &&
      Array.isArray(result.diagnostics)
    );
  },

  // Assert hook event structure
  isValidHookEvent: (event: any): event is HookEvent => {
    return (
      typeof event === 'object' &&
      event !== null &&
      typeof event.event === 'string' &&
      typeof event.timestamp === 'number' &&
      event.data !== undefined
    );
  },

  // Assert config structure
  isValidConfig: (config: any): config is LspConfig => {
    return (
      typeof config === 'object' &&
      config !== null &&
      (!config.disabled || Array.isArray(config.disabled)) &&
      (!config.enabled || Array.isArray(config.enabled))
    );
  },

  // Assert file path is absolute
  isAbsolutePath: (path: string): boolean => {
    return path.startsWith('/') || /^[A-Za-z]:\\/.test(path);
  },

  // Assert CLI output format
  isValidCLIOutput: (output: string, shouldContainSystemMessage: boolean = false): boolean => {
    if (shouldContainSystemMessage) {
      return output.includes('[[system-message]]:');
    }
    return typeof output === 'string';
  }
};

/**
 * Data generation utilities
 */
export const generators = {
  // Generate random string
  randomString: (length: number = 8): string => {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  },

  // Generate random file path
  randomFilePath: (extension: string = '.ts', directory: string = '/tmp'): string => {
    return join(directory, `${generators.randomString()}.${extension.replace('.', '')}`);
  },

  // Generate test file content for language
  testFileContent: (language: string, hasErrors: boolean = false): string => {
    const contentMap: Record<string, { clean: string; withErrors: string }> = {
      typescript: {
        clean: 'const message: string = "Hello, world!"; console.log(message);',
        withErrors: 'const x: string = 42; const y: number = "wrong";'
      },
      javascript: {
        clean: 'const message = "Hello, world!"; console.log(message);',
        withErrors: 'console.log(undefinedVariable);'
      },
      python: {
        clean: 'def greet(name: str) -> str:\n    return f"Hello, {name}!"\nprint(greet("World"))',
        withErrors: 'def func(x: int) -> str:\n    return x + 1'
      },
      go: {
        clean: 'package main\nimport "fmt"\nfunc main() {\n    fmt.Println("Hello")\n}',
        withErrors: 'package main\nfunc main() {\n    undefinedFunction()\n}'
      }
    };

    const content = contentMap[language];
    if (!content) {
      throw new Error(`Unknown language: ${language}`);
    }

    return hasErrors ? content.withErrors : content.clean;
  },

  // Generate mock diagnostic result
  mockDiagnosticResult: (
    language: string = 'typescript',
    errorCount: number = 1,
    warningCount: number = 0
  ): DiagnosticResult => {
    const diagnostics = [];
    
    // Add errors
    for (let i = 0; i < errorCount; i++) {
      diagnostics.push({
        line: 10 + i,
        column: 5,
        severity: 'error' as const,
        message: `Test error ${i + 1}`,
        code: `E${1000 + i}`
      });
    }
    
    // Add warnings
    for (let i = 0; i < warningCount; i++) {
      diagnostics.push({
        line: 20 + i,
        column: 8,
        severity: 'warning' as const,
        message: `Test warning ${i + 1}`,
        code: `W${2000 + i}`
      });
    }

    return {
      language,
      diagnosticCount: errorCount + warningCount,
      summary: `${errorCount} errors, ${warningCount} warnings`,
      diagnostics
    };
  }
};

/**
 * Test suite helpers
 */
export const suiteHelpers = {
  // Create common test setup
  createTestSetup: () => {
    const tempDir = new TempDirectory();
    const cleanup = () => tempDir.cleanup();
    
    return { tempDir, cleanup };
  },

  // Create test with timeout and cleanup
  createTimedTest: (
    name: string,
    testFn: () => Promise<void>,
    timeout: number = 30000,
    cleanup?: () => void
  ) => {
    return async () => {
      try {
        await asyncUtils.withTimeout(testFn(), timeout, `Test "${name}" timed out after ${timeout}ms`);
      } finally {
        if (cleanup) {
          cleanup();
        }
      }
    };
  },

  // Skip test in CI environment
  skipInCI: (): boolean => {
    return process.env.CI === 'true';
  },

  // Skip test on Windows
  skipOnWindows: (): boolean => {
    return process.platform === 'win32';
  },

  // Get platform-specific path separator
  getPathSep: (): string => {
    return process.platform === 'win32' ? '\\' : '/';
  }
};

/**
 * JSON parsing utilities for test output
 */
export const jsonUtils = {
  // Safely parse JSON from CLI output
  parseSystemMessage: (output: string): any => {
    const parts = output.split('[[system-message]]:');
    if (parts.length < 2) {
      throw new Error('No system message found in output');
    }
    
    const jsonPart = parts[1].trim();
    try {
      return JSON.parse(jsonPart);
    } catch (error) {
      throw new Error(`Failed to parse system message JSON: ${error}`);
    }
  },

  // Extract diagnostic result from CLI output
  extractDiagnosticResult: (output: string): DiagnosticResult => {
    const parsed = jsonUtils.parseSystemMessage(output);
    
    if (!assertions.isValidDiagnosticResult(parsed)) {
      throw new Error('Invalid diagnostic result structure');
    }
    
    return parsed;
  },

  // Pretty print JSON for debugging
  prettyPrint: (obj: any): string => {
    return JSON.stringify(obj, null, 2);
  }
};

/**
 * Path utilities for cross-platform testing
 */
export const pathUtils = {
  // Normalize path for current platform
  normalize: (path: string): string => {
    return path.replace(/[/\\]/g, require('path').sep);
  },

  // Convert to Unix-style path
  toUnix: (path: string): string => {
    return path.replace(/\\/g, '/');
  },

  // Convert to Windows-style path
  toWindows: (path: string): string => {
    return path.replace(/\//g, '\\');
  },

  // Join paths safely
  joinSafe: (...parts: string[]): string => {
    return join(...parts);
  }
};

/**
 * Language detection utilities
 */
export const languageUtils = {
  // Get language from file extension
  getLanguageFromExtension: (filePath: string): string | null => {
    const ext = filePath.toLowerCase().substring(filePath.lastIndexOf('.'));
    const languageMap: Record<string, string> = {
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.py': 'python',
      '.pyw': 'python',
      '.go': 'go',
      '.rs': 'rust',
      '.java': 'java',
      '.php': 'php',
      '.scala': 'scala',
      '.sc': 'scala'
    };
    
    return languageMap[ext] || null;
  },

  // Get file extensions for language
  getExtensionsForLanguage: (language: string): string[] => {
    const extMap: Record<string, string[]> = {
      typescript: ['.ts', '.tsx'],
      javascript: ['.js', '.jsx'],
      python: ['.py', '.pyw'],
      go: ['.go'],
      rust: ['.rs'],
      java: ['.java'],
      php: ['.php'],
      scala: ['.scala', '.sc']
    };
    
    return extMap[language] || [];
  },

  // Check if file is supported
  isLanguageSupported: (language: string): boolean => {
    const supportedLanguages = [
      'typescript', 'javascript', 'python', 'go', 'rust',
      'java', 'php', 'scala', 'cpp', 'lua', 'elixir'
    ];
    
    return supportedLanguages.includes(language);
  }
};

/**
 * Export all utilities as a single object for convenience
 */
export const testUtils = {
  TempDirectory,
  asyncUtils,
  assertions,
  generators,
  suiteHelpers,
  jsonUtils,
  pathUtils,
  languageUtils
};