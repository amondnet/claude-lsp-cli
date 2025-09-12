import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { parseArguments } from '../src/cli/utils/arg-parser';
import { globalSettings } from '../src/cli/utils/global-settings';

describe('Argument Parser', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
    // Clear environment variables for testing
    delete process.env.PORT;
    delete process.env.BROWSER;
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('Basic command parsing', () => {
    test('should parse command with no args', () => {
      const result = parseArguments(['diagnostics']);
      expect(result.command).toBe('diagnostics');
      expect(result.args).toEqual([]);
      expect(result.globalFlags.port).toBeUndefined();
      expect(result.globalFlags.browser).toBeUndefined();
    });

    test('should parse command with single arg', () => {
      const result = parseArguments(['diagnostics', '/path/to/file.ts']);
      expect(result.command).toBe('diagnostics');
      expect(result.args).toEqual(['/path/to/file.ts']);
    });

    test('should parse command with multiple args', () => {
      const result = parseArguments(['hook', 'PostToolUse', 'arg2', 'arg3']);
      expect(result.command).toBe('hook');
      expect(result.args).toEqual(['PostToolUse', 'arg2', 'arg3']);
    });

    test('should handle no command', () => {
      const result = parseArguments([]);
      expect(result.command).toBeUndefined();
      expect(result.args).toEqual([]);
    });
  });

  describe('Global flags parsing', () => {
    test('should parse port flag with short alias', () => {
      const result = parseArguments(['-p', '8080', 'diagnostics']);
      expect(result.command).toBe('diagnostics');
      expect(result.globalFlags.port).toBe(8080);
    });

    test('should parse port flag with long form', () => {
      const result = parseArguments(['--port', '3000', 'diagnostics']);
      expect(result.command).toBe('diagnostics');
      expect(result.globalFlags.port).toBe(3000);
    });

    test('should parse browser flag with short alias', () => {
      const result = parseArguments(['-b', 'chrome', 'diagnostics']);
      expect(result.command).toBe('diagnostics');
      expect(result.globalFlags.browser).toBe('chrome');
    });

    test('should parse browser flag with long form', () => {
      const result = parseArguments(['--browser', 'firefox', 'diagnostics']);
      expect(result.command).toBe('diagnostics');
      expect(result.globalFlags.browser).toBe('firefox');
    });

    test('should parse multiple global flags', () => {
      const result = parseArguments(['-p', '9000', '-b', 'safari', 'diagnostics', 'file.ts']);
      expect(result.command).toBe('diagnostics');
      expect(result.args).toEqual(['file.ts']);
      expect(result.globalFlags.port).toBe(9000);
      expect(result.globalFlags.browser).toBe('safari');
    });

    test('should handle flags after command', () => {
      const result = parseArguments(['diagnostics', 'file.ts', '--port', '8080']);
      expect(result.command).toBe('diagnostics');
      expect(result.args).toEqual(['file.ts']);
      expect(result.globalFlags.port).toBe(8080);
    });
  });

  describe('Environment variable defaults', () => {
    test('should use PORT environment variable as default', () => {
      process.env.PORT = '5000';
      const result = parseArguments(['diagnostics']);
      expect(result.globalFlags.port).toBe(5000);
    });

    test('should use BROWSER environment variable as default', () => {
      process.env.BROWSER = 'edge';
      const result = parseArguments(['diagnostics']);
      expect(result.globalFlags.browser).toBe('edge');
    });

    test('should override environment variables with flags', () => {
      process.env.PORT = '5000';
      process.env.BROWSER = 'edge';
      const result = parseArguments(['-p', '8080', '-b', 'chrome', 'diagnostics']);
      expect(result.globalFlags.port).toBe(8080);
      expect(result.globalFlags.browser).toBe('chrome');
    });

    test('should handle invalid PORT environment variable', () => {
      process.env.PORT = 'invalid';
      const result = parseArguments(['diagnostics']);
      expect(isNaN(result.globalFlags.port as number)).toBe(true);
    });
  });

  describe('Global settings update', () => {
    test('should update global settings when port is provided', () => {
      parseArguments(['--port', '7777', 'diagnostics']);
      expect(globalSettings.port).toBe(7777);
    });

    test('should update global settings when browser is provided', () => {
      parseArguments(['--browser', 'webkit', 'diagnostics']);
      expect(globalSettings.browser).toBe('webkit');
    });

    test('should not update global settings with invalid port', () => {
      const originalPort = globalSettings.port;
      parseArguments(['--port', 'not-a-number', 'diagnostics']);
      expect(globalSettings.port).toBe(originalPort);
    });
  });

  describe('Special cases', () => {
    test('should handle help flag', () => {
      const result = parseArguments(['-h']);
      expect(result.command).toBeUndefined();
      expect(result.args).toEqual([]);
    });

    test('should handle long help flag', () => {
      const result = parseArguments(['--help']);
      expect(result.command).toBeUndefined();
      expect(result.args).toEqual([]);
    });

    test('should handle double dash arguments', () => {
      const result = parseArguments(['diagnostics', '--', '--file-with-dashes.ts']);
      expect(result.command).toBe('diagnostics');
      // Note: minimist puts items after -- in the parsed.['--'] array, not in args
      expect(result.args).toEqual([]);
    });

    test('should handle equal sign in flag values', () => {
      const result = parseArguments(['--port=8080', '--browser=chrome', 'diagnostics']);
      expect(result.globalFlags.port).toBe(8080);
      expect(result.globalFlags.browser).toBe('chrome');
    });

    test('should handle spaces in browser value', () => {
      const result = parseArguments(['--browser', 'Google Chrome', 'diagnostics']);
      expect(result.globalFlags.browser).toBe('Google Chrome');
    });
  });
});