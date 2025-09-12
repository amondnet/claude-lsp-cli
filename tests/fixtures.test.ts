/**
 * Test the fixtures system to ensure all components work correctly
 */

import { describe, test, expect } from 'bun:test';
import {
  postToolUseEvents,
  userPromptSubmitEvents,
  typescriptResults,
  pythonResults,
  createDiagnosticResult,
  typescriptFiles,
  lspConfigs,
  basicCommands,
  MockFileSystem,
  TempDirectory,
  testUtils,
  serializeHookEvent
} from './fixtures';

describe('Test Fixtures Validation', () => {
  describe('Hook Data', () => {
    test('creates valid PostToolUse events', () => {
      const event = postToolUseEvents.fileEdit('/test/file.ts');
      
      expect(event.event).toBe('PostToolUse');
      expect(event.timestamp).toBeTypeOf('number');
      expect(event.data).toBeDefined();
      expect(event.data.tool).toBeDefined();
    });

    test('creates valid UserPromptSubmit events', () => {
      const event = userPromptSubmitEvents.lspCommand('status');
      
      expect(event.event).toBe('UserPromptSubmit');
      expect(event.data.prompt).toBe('>lsp: status');
    });

    test('serializes hook events to JSON', () => {
      const event = postToolUseEvents.fileEdit('/test.ts');
      const serialized = serializeHookEvent(event);
      const parsed = JSON.parse(serialized);
      
      expect(parsed.event).toBe('PostToolUse');
      expect(parsed.timestamp).toBeTypeOf('number');
    });
  });

  describe('Diagnostic Results', () => {
    test('creates valid TypeScript results', () => {
      const result = typescriptResults.withErrors();
      
      expect(result.language).toBe('typescript');
      expect(result.diagnosticCount).toBeGreaterThan(0);
      expect(result.diagnostics).toBeInstanceOf(Array);
      expect(result.diagnostics.length).toBeGreaterThan(0);
    });

    test('creates valid Python results', () => {
      const result = pythonResults.typeErrors();
      
      expect(result.language).toBe('python');
      expect(result.diagnostics.every(d => 
        typeof d.line === 'number' && 
        typeof d.column === 'number' && 
        ['error', 'warning', 'info'].includes(d.severity)
      )).toBe(true);
    });

    test('creates custom diagnostic results', () => {
      const result = createDiagnosticResult('go', 'errors');
      
      expect(result.language).toBe('go');
      expect(result.diagnosticCount).toBe(1);
      expect(result.diagnostics[0].severity).toBe('error');
    });
  });

  describe('File Contents', () => {
    test('provides TypeScript file templates', () => {
      const cleanCode = typescriptFiles.clean;
      const errorCode = typescriptFiles.withTypeErrors;
      
      expect(cleanCode).toContain('interface');
      expect(errorCode).toContain('Type error');
    });
  });

  describe('Configuration Data', () => {
    test('creates valid LSP configs', () => {
      const config = lspConfigs.someDisabled();
      
      expect(config.disabled).toBeInstanceOf(Array);
      expect(config.disabled?.length).toBeGreaterThan(0);
    });
  });

  describe('CLI Scenarios', () => {
    test('provides valid test cases', () => {
      expect(basicCommands.length).toBeGreaterThan(0);
      
      const helpCommand = basicCommands.find(cmd => cmd.name === 'help command');
      expect(helpCommand).toBeDefined();
      expect(helpCommand?.args).toEqual(['help']);
      expect(helpCommand?.expectedExitCode).toBe(0);
    });
  });

  describe('Mock Implementations', () => {
    test('MockFileSystem works correctly', () => {
      const fs = new MockFileSystem();
      
      fs.setFile('/test.ts', 'content');
      expect(fs.hasFile('/test.ts')).toBe(true);
      expect(fs.getFile('/test.ts')).toBe('content');
      
      fs.clear();
      expect(fs.hasFile('/test.ts')).toBe(false);
    });
  });

  describe('Test Utilities', () => {
    test('TempDirectory creates and cleans up', () => {
      const tempDir = new TempDirectory('fixture-test');
      
      const filePath = tempDir.createFile('test.txt', 'hello world');
      expect(tempDir.exists('test.txt')).toBe(true);
      expect(tempDir.readFile('test.txt')).toBe('hello world');
      
      tempDir.cleanup();
      // After cleanup, the base directory should not exist
      expect(() => tempDir.readFile('test.txt')).toThrow();
    });

    test('assertions work correctly', () => {
      const result = typescriptResults.clean();
      expect(testUtils.assertions.isValidDiagnosticResult(result)).toBe(true);
      
      const event = postToolUseEvents.fileEdit('/test.ts');
      expect(testUtils.assertions.isValidHookEvent(event)).toBe(true);
    });

    test('generators create valid data', () => {
      const randomString = testUtils.generators.randomString(10);
      expect(randomString.length).toBe(10);
      
      const filePath = testUtils.generators.randomFilePath('.py', '/tmp');
      expect(filePath).toContain('/tmp');
      expect(filePath).toContain('.py');
    });

    test('language utils work correctly', () => {
      expect(testUtils.languageUtils.getLanguageFromExtension('test.ts')).toBe('typescript');
      expect(testUtils.languageUtils.getExtensionsForLanguage('python')).toContain('.py');
      expect(testUtils.languageUtils.isLanguageSupported('typescript')).toBe(true);
      expect(testUtils.languageUtils.isLanguageSupported('unknown')).toBe(false);
    });
  });

  describe('Integration', () => {
    test('fixtures work together for complete scenarios', () => {
      const tempDir = new TempDirectory();
      const mockFs = new MockFileSystem();
      
      try {
        // Create test file with fixtures
        const content = typescriptFiles.withTypeErrors;
        const filePath = tempDir.createFile('error.ts', content);
        
        // Mock file system
        mockFs.setFile(filePath, content);
        
        // Create hook event
        const hookEvent = postToolUseEvents.fileEdit(filePath);
        
        // Create diagnostic result
        const diagnosticResult = typescriptResults.withErrors();
        
        // Verify everything works together
        expect(tempDir.exists('error.ts')).toBe(true);
        expect(mockFs.hasFile(filePath)).toBe(true);
        expect(hookEvent.data.tool).toBeDefined();
        expect(diagnosticResult.diagnostics.length).toBeGreaterThan(0);
        
      } finally {
        tempDir.cleanup();
      }
    });
  });
});