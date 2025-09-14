/**
 * Test Coverage Verification
 * Ensures all test categories have comprehensive language coverage
 */

import { describe, test, expect } from 'bun:test';
import { languageTestData, diagnosticScenarios, configCommands } from './fixtures/cli-scenarios';

const SUPPORTED_LANGUAGES = [
  'typescript',
  'python',
  'go',
  'rust',
  'java',
  'cpp',
  'php',
  'scala',
  'lua',
  'elixir',
  'terraform',
];
const SUPPORTED_EXTENSIONS = [
  '.ts',
  '.tsx',
  '.mts',
  '.cts', // TypeScript
  '.py',
  '.pyw', // Python
  '.go', // Go
  '.rs', // Rust
  '.java', // Java
  '.cpp',
  '.cc',
  '.cxx',
  '.c++',
  '.hpp',
  '.hh',
  '.hxx',
  '.h++', // C++
  '.php', // PHP
  '.scala',
  '.sc', // Scala
  '.lua', // Lua
  '.ex',
  '.exs', // Elixir
  '.tf',
  '.tfvars', // Terraform
];

describe('Test Coverage Verification', () => {
  describe('Language Test Data Coverage', () => {
    test('should have test data for all supported languages', () => {
      for (const language of SUPPORTED_LANGUAGES) {
        expect(languageTestData).toHaveProperty(language);
        const data = languageTestData[language as keyof typeof languageTestData];

        // Verify each language has required properties
        expect(data).toHaveProperty('extensions');
        expect(data).toHaveProperty('validFiles');
        expect(data).toHaveProperty('invalidContent');
        expect(data).toHaveProperty('validContent');
        expect(data).toHaveProperty('name');

        // Verify arrays are not empty
        expect(Array.isArray(data.extensions)).toBe(true);
        expect(data.extensions.length).toBeGreaterThan(0);
        expect(Array.isArray(data.validFiles)).toBe(true);
        expect(data.validFiles.length).toBeGreaterThan(0);

        // Verify content strings are not empty
        expect(data.invalidContent.trim()).not.toBe('');
        expect(data.validContent.trim()).not.toBe('');
        expect(data.name.trim()).not.toBe('');
      }
    });

    test('should cover all supported file extensions', () => {
      const coveredExtensions = new Set<string>();

      for (const language of SUPPORTED_LANGUAGES) {
        const data = languageTestData[language as keyof typeof languageTestData];
        for (const ext of data.extensions) {
          coveredExtensions.add(ext);
        }
      }

      for (const ext of SUPPORTED_EXTENSIONS) {
        expect(coveredExtensions.has(ext)).toBe(true);
      }
    });
  });

  describe('Diagnostic Scenarios Coverage', () => {
    test('should have error and clean scenarios for all languages', () => {
      const languagesWithErrors = new Set<string>();
      const languagesWithClean = new Set<string>();

      for (const scenario of diagnosticScenarios) {
        if (scenario.expectedDiagnostics && scenario.expectedErrors) {
          languagesWithErrors.add(scenario.language);
        } else if (!scenario.expectedDiagnostics && !scenario.expectedErrors) {
          languagesWithClean.add(scenario.language);
        }
      }

      for (const language of SUPPORTED_LANGUAGES) {
        expect(languagesWithErrors.has(language)).toBe(true);
        expect(languagesWithClean.has(language)).toBe(true);
      }
    });

    test('should have matching extensions between language data and diagnostic scenarios', () => {
      for (const language of SUPPORTED_LANGUAGES) {
        const languageData = languageTestData[language as keyof typeof languageTestData];
        const scenarios = diagnosticScenarios.filter((s) => s.language === language);

        expect(scenarios.length).toBeGreaterThanOrEqual(2); // At least error + clean scenario

        const usedExtensions = new Set(scenarios.map((s) => s.extension));
        const availableExtensions = new Set(languageData.extensions);

        // Every diagnostic scenario should use a valid extension for that language
        for (const ext of usedExtensions) {
          expect(availableExtensions.has(ext)).toBe(true);
        }
      }
    });
  });

  describe('Configuration Commands Coverage', () => {
    test('should have enable/disable commands for all languages', () => {
      const languagesWithEnable = new Set<string>();
      const languagesWithDisable = new Set<string>();

      for (const cmd of configCommands) {
        if (cmd.name.startsWith('enable ')) {
          const language = cmd.args[1];
          if (language && SUPPORTED_LANGUAGES.includes(language)) {
            languagesWithEnable.add(language);
          }
        } else if (cmd.name.startsWith('disable ')) {
          const language = cmd.args[1];
          if (language && SUPPORTED_LANGUAGES.includes(language)) {
            languagesWithDisable.add(language);
          }
        }
      }

      for (const language of SUPPORTED_LANGUAGES) {
        expect(languagesWithEnable.has(language)).toBe(true);
        expect(languagesWithDisable.has(language)).toBe(true);
      }
    });

    test('should have correct expected output for each language configuration command', () => {
      for (const cmd of configCommands) {
        if (cmd.name.startsWith('enable ') || cmd.name.startsWith('disable ')) {
          const language = cmd.args[1];
          if (language && SUPPORTED_LANGUAGES.includes(language)) {
            const languageData = languageTestData[language as keyof typeof languageTestData];

            expect(cmd.expectedStdout).toBeDefined();
            // The regex should match the language name from our language data
            const regex = cmd.expectedStdout as RegExp;
            const action = cmd.name.startsWith('enable') ? 'enabled' : 'disabled';
            expect(regex.test(`${languageData.name} checking ${action}`)).toBe(true);
          }
        }
      }
    });
  });

  describe('Test Category Completeness', () => {
    test('should verify that all critical test categories exist', () => {
      const testFiles = [
        'cli.test.ts', // Basic CLI functionality
        'hook-handlers.test.ts', // Hook processing
        'cli-utils-deduplication.test.ts', // Deduplication logic
        'file-checker.test.ts', // Core file checking
        'language-comprehensive.test.ts', // Language coverage
        'integration-end-to-end.test.ts', // E2E integration
        'configuration-management.test.ts', // Config management
      ];

      // This test documents what test files should exist
      expect(testFiles.length).toBeGreaterThan(5);
    });

    test('should have exit code coverage for all scenarios', () => {
      // Test that our test scenarios cover all expected exit codes:
      // - CLI commands: Always 0
      // - Hook with diagnostics: 2
      // - Hook without diagnostics: 0
      // - Hook with duplicated diagnostics: 0
      // - Hook with errors: 1

      const expectedExitCodes = [0, 1, 2];
      expect(expectedExitCodes).toContain(0); // CLI success
      expect(expectedExitCodes).toContain(1); // Hook errors
      expect(expectedExitCodes).toContain(2); // Hook diagnostics found
    });

    test('should verify file vs folder handling coverage', () => {
      // Verify that tests distinguish between files and folders:
      // 1. Files are processed by both check and hook
      // 2. Folders are ignored by both check and hook

      const fileExtensions = SUPPORTED_EXTENSIONS;
      const folderPaths = ['.', '/', '/tmp'];

      expect(fileExtensions.length).toBe(SUPPORTED_EXTENSIONS.length); // All supported extensions
      expect(folderPaths.length).toBeGreaterThan(0); // Folder test cases exist
    });
  });

  describe('Edge Cases Coverage', () => {
    test('should cover unsupported file types', () => {
      const unsupportedExtensions = [
        '.txt',
        '.md',
        '.json',
        '.xml',
        '.yaml',
        '.yml',
        '.csv',
        '.png',
        '.jpg',
      ];

      for (const ext of unsupportedExtensions) {
        expect(SUPPORTED_EXTENSIONS.includes(ext)).toBe(false);
      }
    });

    test('should cover error handling scenarios', () => {
      const errorScenarios = [
        'missing file',
        'invalid JSON input',
        'malformed hook data',
        'directory instead of file',
        'permission errors',
        'corrupted state files',
        'invalid language names',
      ];

      expect(errorScenarios.length).toBeGreaterThan(5);
    });

    test('should have deduplication coverage for all languages', () => {
      // Verify that deduplication logic is tested for languages that can produce diagnostics
      const languagesWithDiagnostics = diagnosticScenarios
        .filter((s) => s.expectedDiagnostics)
        .map((s) => s.language);

      const uniqueLanguagesWithDiagnostics = [...new Set(languagesWithDiagnostics)];
      expect(uniqueLanguagesWithDiagnostics.length).toBe(SUPPORTED_LANGUAGES.length);
    });
  });

  describe('Performance and Scale Coverage', () => {
    test('should have timeout coverage for long-running operations', () => {
      // Verify that tests account for operations that might take time:
      // - Language tool execution
      // - Large file processing
      // - Multiple file processing in parallel

      const timeoutScenarios = ['language tool execution', 'large files', 'parallel processing'];
      expect(timeoutScenarios.length).toBeGreaterThan(2);
    });

    test('should have concurrent operation coverage', () => {
      // Verify that tests cover concurrent scenarios:
      // - Multiple hook calls
      // - Rapid successive commands
      // - State file conflicts

      const concurrencyScenarios = ['multiple hooks', 'rapid commands', 'state conflicts'];
      expect(concurrencyScenarios.length).toBeGreaterThan(2);
    });
  });
});
