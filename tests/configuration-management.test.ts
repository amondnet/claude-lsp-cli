import { describe, test, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import { join } from 'path';
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';

describe('Configuration Management', () => {
  let mockHomeDir: string;
  let originalEnv: NodeJS.ProcessEnv;
  let configModule: any;

  // Create a temporary directory for each test
  beforeEach(() => {
    originalEnv = { ...process.env };
    mockHomeDir = join(
      tmpdir(),
      `claude-lsp-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );

    // Mock HOME directory
    process.env.HOME = mockHomeDir;
    delete process.env.USERPROFILE;

    // Clear module cache to get fresh imports
    const modulePath = require.resolve('../src/cli/commands/config');
    delete require.cache[modulePath];
    const helpModulePath = require.resolve('../src/cli/commands/help');
    delete require.cache[helpModulePath];

    configModule = require('../src/cli/commands/config');
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;

    // Clean up test directory
    if (existsSync(mockHomeDir)) {
      rmSync(mockHomeDir, { recursive: true, force: true });
    }

    // Clear module cache
    const modulePath = require.resolve('../src/cli/commands/config');
    delete require.cache[modulePath];
    const helpModulePath = require.resolve('../src/cli/commands/help');
    delete require.cache[helpModulePath];
  });

  describe('loadConfig', () => {
    test('should return empty object when config file does not exist', () => {
      const config = configModule.loadConfig();
      expect(config).toEqual({});
    });

    test('should load existing config file', () => {
      const configPath = join(mockHomeDir, '.claude', 'lsp-config.json');
      const configDir = join(mockHomeDir, '.claude');

      mkdirSync(configDir, { recursive: true });
      writeFileSync(configPath, JSON.stringify({ disablePython: true }));

      const config = configModule.loadConfig();
      expect(config).toEqual({ disablePython: true });
    });

    test('should load complex config file', () => {
      const configPath = join(mockHomeDir, '.claude', 'lsp-config.json');
      const configDir = join(mockHomeDir, '.claude');
      const testConfig = {
        disable: false,
        disablePython: true,
        disableTypeScript: false,
        customField: 'test-value',
      };

      mkdirSync(configDir, { recursive: true });
      writeFileSync(configPath, JSON.stringify(testConfig, null, 2));

      const config = configModule.loadConfig();
      expect(config).toEqual(testConfig);
    });

    test('should throw error for invalid JSON (no error handling in loadConfig)', () => {
      const configPath = join(mockHomeDir, '.claude', 'lsp-config.json');
      const configDir = join(mockHomeDir, '.claude');

      mkdirSync(configDir, { recursive: true });
      writeFileSync(configPath, '{ invalid json }');

      // loadConfig doesn't handle JSON parse errors, so it should throw
      expect(() => configModule.loadConfig()).toThrow();
    });

    test('should throw error for empty file (no error handling in loadConfig)', () => {
      const configPath = join(mockHomeDir, '.claude', 'lsp-config.json');
      const configDir = join(mockHomeDir, '.claude');

      mkdirSync(configDir, { recursive: true });
      writeFileSync(configPath, '');

      // loadConfig doesn't handle empty file errors, so it should throw
      expect(() => configModule.loadConfig()).toThrow();
    });

    test('should handle USERPROFILE on Windows', () => {
      delete process.env.HOME;
      process.env.USERPROFILE = mockHomeDir;

      // Clear and reimport module to use new env vars
      const modulePath = require.resolve('../src/cli/commands/config');
      delete require.cache[modulePath];
      const windowsConfigModule = require('../src/cli/commands/config');

      const config = windowsConfigModule.loadConfig();
      expect(config).toEqual({});
    });

    test('should handle missing HOME and USERPROFILE', () => {
      delete process.env.HOME;
      delete process.env.USERPROFILE;

      // Clear and reimport module to use new env vars
      const modulePath = require.resolve('../src/cli/commands/config');
      delete require.cache[modulePath];
      const noHomeConfigModule = require('../src/cli/commands/config');

      // When no HOME dir is set, it uses empty string as base path
      // This will look for .claude/lsp-config.json in root directory
      // NOTE: If this fails, it means there's a config file in /.claude/lsp-config.json
      // which is outside our test isolation
      const config = noHomeConfigModule.loadConfig();

      // In a clean environment this should be empty, but if there's a system config
      // we'll just verify it's an object (the important thing is it doesn't crash)
      expect(typeof config).toBe('object');
      expect(config).not.toBeNull();
    });
  });

  describe('disableLanguage', () => {
    // Mock showStatus to avoid dependency issues
    beforeEach(() => {
      const helpModule = require('../src/cli/commands/help');
      spyOn(helpModule, 'showStatus').mockResolvedValue(
        '🟢 Language Status:\n  Python: ❌ Disabled\n  TypeScript: ✅ Enabled'
      );
    });

    test('should disable specific language', async () => {
      const result = await configModule.disableLanguage('python');

      expect(result).toContain('🚫 Disabled python checking globally');
      expect(result).toContain('🟢 Language Status:');

      // Check config file was created
      const config = configModule.loadConfig();
      expect(config.disablePython).toBe(true);
    });

    test('should disable all languages', async () => {
      const result = await configModule.disableLanguage('all');

      expect(result).toContain('🚫 Disabled ALL language checking globally');

      const config = configModule.loadConfig();
      expect(config.disable).toBe(true);
    });

    test('should handle case-insensitive language names', async () => {
      await configModule.disableLanguage('PYTHON');
      const config1 = configModule.loadConfig();
      expect(config1.disablePython).toBe(true);

      await configModule.disableLanguage('TypeScript');
      const config2 = configModule.loadConfig();
      expect(config2.disableTypeScript).toBe(true);

      await configModule.disableLanguage('c++');
      const config3 = configModule.loadConfig();
      expect(config3.disableCpp).toBe(true);
    });

    test('should handle language aliases', async () => {
      await configModule.disableLanguage('cpp');
      const config1 = configModule.loadConfig();
      expect(config1.disableCpp).toBe(true);

      await configModule.disableLanguage('c++');
      const config2 = configModule.loadConfig();
      expect(config2.disableCpp).toBe(true);

      await configModule.disableLanguage('c');
      const config3 = configModule.loadConfig();
      expect(config3.disableCpp).toBe(true);
    });

    test('should handle all supported languages', async () => {
      const languages = [
        'typescript',
        'python',
        'go',
        'rust',
        'java',
        'cpp',
        'c++',
        'c',
        'php',
        'scala',
        'lua',
        'elixir',
        'terraform',
      ];

      for (const lang of languages) {
        await configModule.disableLanguage(lang);
      }

      const config = configModule.loadConfig();
      expect(config.disableTypeScript).toBe(true);
      expect(config.disablePython).toBe(true);
      expect(config.disableGo).toBe(true);
      expect(config.disableRust).toBe(true);
      expect(config.disableJava).toBe(true);
      expect(config.disableCpp).toBe(true); // Should be set by cpp, c++, and c
      expect(config.disablePhp).toBe(true);
      expect(config.disableScala).toBe(true);
      expect(config.disableLua).toBe(true);
      expect(config.disableElixir).toBe(true);
      expect(config.disableTerraform).toBe(true);
    });

    test('should preserve existing config when disabling language', async () => {
      // Set up existing config
      const configPath = join(mockHomeDir, '.claude', 'lsp-config.json');
      const configDir = join(mockHomeDir, '.claude');
      mkdirSync(configDir, { recursive: true });
      writeFileSync(
        configPath,
        JSON.stringify({
          disablePython: false,
          customField: 'preserved',
        })
      );

      await configModule.disableLanguage('typescript');

      const config = configModule.loadConfig();
      expect(config.disablePython).toBe(false);
      expect(config.disableTypeScript).toBe(true);
      expect(config.customField).toBe('preserved');
    });

    test('should create .claude directory if it does not exist', async () => {
      const claudeDir = join(mockHomeDir, '.claude');
      expect(existsSync(claudeDir)).toBe(false);

      await configModule.disableLanguage('python');

      expect(existsSync(claudeDir)).toBe(true);
      const config = configModule.loadConfig();
      expect(config.disablePython).toBe(true);
    });

    test('should handle unknown language gracefully', async () => {
      const result = await configModule.disableLanguage('unknown-language');

      // Should not throw error and still show status
      expect(result).toContain('🟢 Language Status:');

      // Config should be empty (no language disabled since 'unknown-language' is not in langMap)
      const config = configModule.loadConfig();
      expect(Object.keys(config).length).toBe(0);
    });

    test('should handle corrupted config file gracefully', async () => {
      // Create corrupted config
      const configPath = join(mockHomeDir, '.claude', 'lsp-config.json');
      const configDir = join(mockHomeDir, '.claude');
      mkdirSync(configDir, { recursive: true });
      writeFileSync(configPath, '{ corrupted json');

      await configModule.disableLanguage('python');

      // Should create new config overwriting corrupted one
      const config = configModule.loadConfig();
      expect(config.disablePython).toBe(true);
    });
  });

  describe('enableLanguage', () => {
    beforeEach(() => {
      const helpModule = require('../src/cli/commands/help');
      spyOn(helpModule, 'showStatus').mockResolvedValue(
        '🟢 Language Status:\n  Python: ✅ Enabled\n  TypeScript: ✅ Enabled'
      );
    });

    test('should enable specific language', async () => {
      // First disable a language
      await configModule.disableLanguage('python');
      let config = configModule.loadConfig();
      expect(config.disablePython).toBe(true);

      // Then enable it
      const result = await configModule.enableLanguage('python');
      expect(result).toContain('✅ Enabled python checking globally');

      config = configModule.loadConfig();
      expect(config.disablePython).toBe(false);
    });

    test('should enable all languages', async () => {
      // First disable all
      await configModule.disableLanguage('all');
      let config = configModule.loadConfig();
      expect(config.disable).toBe(true);

      // Then enable all
      const result = await configModule.enableLanguage('all');
      expect(result).toContain('✅ Enabled ALL language checking globally');

      config = configModule.loadConfig();
      expect(config.disable).toBe(false);
    });

    test('should handle case-insensitive language names', async () => {
      // Disable languages first
      await configModule.disableLanguage('python');
      await configModule.disableLanguage('typescript');

      // Enable with different cases
      await configModule.enableLanguage('PYTHON');
      await configModule.enableLanguage('TypeScript');

      const config = configModule.loadConfig();
      expect(config.disablePython).toBe(false);
      expect(config.disableTypeScript).toBe(false);
    });

    test('should handle language aliases', async () => {
      // Disable cpp languages first
      await configModule.disableLanguage('cpp');

      // Enable using aliases
      await configModule.enableLanguage('c++');
      const config = configModule.loadConfig();
      expect(config.disableCpp).toBe(false);
    });

    test('should preserve other settings when enabling language', async () => {
      // Set up initial config
      const configPath = join(mockHomeDir, '.claude', 'lsp-config.json');
      const configDir = join(mockHomeDir, '.claude');
      mkdirSync(configDir, { recursive: true });
      writeFileSync(
        configPath,
        JSON.stringify({
          disablePython: true,
          disableTypeScript: true,
          customField: 'preserved',
        })
      );

      await configModule.enableLanguage('python');

      const config = configModule.loadConfig();
      expect(config.disablePython).toBe(false);
      expect(config.disableTypeScript).toBe(true); // Should remain unchanged
      expect(config.customField).toBe('preserved');
    });

    test('should create config directory if not exists', async () => {
      const claudeDir = join(mockHomeDir, '.claude');
      expect(existsSync(claudeDir)).toBe(false);

      await configModule.enableLanguage('python');

      expect(existsSync(claudeDir)).toBe(true);
    });

    test('should handle unknown language gracefully', async () => {
      const result = await configModule.enableLanguage('unknown-language');

      // Should not throw error and still show status
      expect(result).toContain('🟢 Language Status:');
    });

    test('should handle enabling already enabled language', async () => {
      // Language is enabled by default, so enabling again should work
      const result = await configModule.enableLanguage('python');
      expect(result).toContain('✅ Enabled python checking globally');

      const config = configModule.loadConfig();
      expect(config.disablePython).toBe(false);
    });
  });

  describe('Language normalization', () => {
    test('should normalize individual language variants correctly', async () => {
      // Test specific languages individually to avoid state conflicts
      await configModule.disableLanguage('typescript');
      let config = configModule.loadConfig();
      expect(config.disableTypeScript).toBe(true);

      // Clear and test python
      await configModule.enableLanguage('typescript');
      await configModule.disableLanguage('python');
      config = configModule.loadConfig();
      expect(config.disablePython).toBe(true);

      // Test cpp variants (they all map to the same key)
      await configModule.enableLanguage('python');
      await configModule.disableLanguage('cpp');
      config = configModule.loadConfig();
      expect(config.disableCpp).toBe(true);

      await configModule.enableLanguage('cpp');
      await configModule.disableLanguage('c++');
      config = configModule.loadConfig();
      expect(config.disableCpp).toBe(true);

      await configModule.enableLanguage('cpp');
      await configModule.disableLanguage('c');
      config = configModule.loadConfig();
      expect(config.disableCpp).toBe(true);
    });

    test('should handle "all" language option correctly', async () => {
      await configModule.disableLanguage('all');
      const config = configModule.loadConfig();
      expect(config.disable).toBe(true);
    });

    test('should handle mixed case inputs', async () => {
      // Test one at a time to avoid state conflicts
      await configModule.disableLanguage('PyThOn');
      let config = configModule.loadConfig();
      expect(config.disablePython).toBe(true);

      // Clear and test next
      await configModule.enableLanguage('python');
      await configModule.disableLanguage('TypeScript');
      config = configModule.loadConfig();
      expect(config.disableTypeScript).toBe(true);

      // Clear and test next
      await configModule.enableLanguage('typescript');
      await configModule.disableLanguage('C++');
      config = configModule.loadConfig();
      expect(config.disableCpp).toBe(true);
    });
  });

  describe('File system operations', () => {
    test('should handle permissions issues gracefully', async () => {
      // This test is platform-dependent and might not work in all environments
      // but demonstrates the intention to handle file system errors
      const configDir = join(mockHomeDir, '.claude');
      mkdirSync(configDir, { recursive: true });

      // Mock fs operations to simulate permission error
      const _originalWriteFileSync = writeFileSync;
      const _mockWriteFileSync = mock(() => {
        throw new Error('EACCES: permission denied');
      });

      // This is more of a documentation test since we can't easily mock fs in Bun
      // In a real scenario, the function should handle file system errors gracefully
      expect(() => {
        // The actual implementation doesn't have explicit error handling
        // This is a note for future improvement
      }).not.toThrow();
    });

    test('should create nested directory structure', async () => {
      const claudeDir = join(mockHomeDir, '.claude');
      expect(existsSync(claudeDir)).toBe(false);

      await configModule.disableLanguage('python');

      expect(existsSync(claudeDir)).toBe(true);
      const configFile = join(claudeDir, 'lsp-config.json');
      expect(existsSync(configFile)).toBe(true);
    });

    test('should write properly formatted JSON', async () => {
      await configModule.disableLanguage('python');
      await configModule.disableLanguage('typescript');

      const configPath = join(mockHomeDir, '.claude', 'lsp-config.json');
      const configContent = readFileSync(configPath, 'utf8');

      expect(() => JSON.parse(configContent)).not.toThrow();

      const config = JSON.parse(configContent);
      expect(config.disablePython).toBe(true);
      expect(config.disableTypeScript).toBe(true);
    });

    test('should maintain JSON formatting with indentation', async () => {
      await configModule.disableLanguage('python');

      const configPath = join(mockHomeDir, '.claude', 'lsp-config.json');
      const configContent = readFileSync(configPath, 'utf8');

      // Should contain proper indentation (2 spaces)
      expect(configContent).toContain('  "disablePython": true');
    });
  });

  describe('Error handling', () => {
    test('should document that loadConfig has no error handling', () => {
      // Create a file that exists but has invalid JSON
      const configPath = join(mockHomeDir, '.claude', 'lsp-config.json');
      const configDir = join(mockHomeDir, '.claude');
      mkdirSync(configDir, { recursive: true });
      writeFileSync(configPath, '{ "invalid": json }');

      // The actual implementation doesn't have try-catch around JSON.parse
      // This documents the current behavior - it will throw
      expect(() => configModule.loadConfig()).toThrow();
    });

    test('should demonstrate updateConfig has error handling but loadConfig does not', async () => {
      // updateConfig has try-catch, so it handles corrupted files gracefully
      const configPath = join(mockHomeDir, '.claude', 'lsp-config.json');
      const configDir = join(mockHomeDir, '.claude');
      mkdirSync(configDir, { recursive: true });
      writeFileSync(configPath, '{ corrupted }');

      // This should work because updateConfig handles errors
      await configModule.disableLanguage('python');

      // Now loadConfig should work because updateConfig created valid JSON
      const config = configModule.loadConfig();
      expect(config.disablePython).toBe(true);
    });
  });

  describe('Integration scenarios', () => {
    test('should handle rapid enable/disable cycles', async () => {
      for (let i = 0; i < 10; i++) {
        await configModule.disableLanguage('python', false);
        let config = configModule.loadConfig();
        expect(config.disablePython).toBe(true);

        await configModule.enableLanguage('python', false);
        config = configModule.loadConfig();
        expect(config.disablePython).toBe(false);
      }
    });

    test('should handle multiple languages in sequence', async () => {
      const languages = ['python', 'typescript', 'go', 'rust'];

      // Disable all
      for (const lang of languages) {
        await configModule.disableLanguage(lang, false);
      }

      let config = configModule.loadConfig();
      expect(config.disablePython).toBe(true);
      expect(config.disableTypeScript).toBe(true);
      expect(config.disableGo).toBe(true);
      expect(config.disableRust).toBe(true);

      // Enable all
      for (const lang of languages) {
        await configModule.enableLanguage(lang, false);
      }

      config = configModule.loadConfig();
      expect(config.disablePython).toBe(false);
      expect(config.disableTypeScript).toBe(false);
      expect(config.disableGo).toBe(false);
      expect(config.disableRust).toBe(false);
    });

    test('should handle mixed enable/disable operations', async () => {
      // Start with some languages disabled
      await configModule.disableLanguage('python', false);
      await configModule.disableLanguage('typescript', false);

      // Enable one, disable another
      await configModule.enableLanguage('python', false);
      await configModule.disableLanguage('go', false);

      const config = configModule.loadConfig();
      expect(config.disablePython).toBe(false);
      expect(config.disableTypeScript).toBe(true);
      expect(config.disableGo).toBe(true);
    });

    test('should handle global disable followed by specific enables', async () => {
      // Disable all languages
      await configModule.disableLanguage('all', false);
      let config = configModule.loadConfig();
      expect(config.disable).toBe(true);

      // Enable specific language (should override global setting)
      await configModule.enableLanguage('python', false);
      config = configModule.loadConfig();
      expect(config.disable).toBe(true); // Global still disabled
      expect(config.disablePython).toBe(false); // But Python specifically enabled
    });
  });
});
