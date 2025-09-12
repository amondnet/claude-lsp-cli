import { describe, test, expect, beforeEach, afterEach } from 'bun:test';

describe('Global Settings', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let GlobalSettingsModule: any;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
    // Clear environment variables for testing
    delete process.env.PORT;
    delete process.env.BROWSER;
    
    // Clear module cache to reset singleton
    const modulePath = require.resolve('../src/cli/utils/global-settings');
    delete require.cache[modulePath];
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
    
    // Clear module cache again for next test
    const modulePath = require.resolve('../src/cli/utils/global-settings');
    delete require.cache[modulePath];
  });

  describe('Singleton pattern', () => {
    test('should return same instance', () => {
      const { globalSettings: settings1 } = require('../src/cli/utils/global-settings');
      const { globalSettings: settings2 } = require('../src/cli/utils/global-settings');
      expect(settings1).toBe(settings2);
    });

    test('should maintain state across imports', () => {
      const { globalSettings: settings1 } = require('../src/cli/utils/global-settings');
      settings1.port = 9999;
      
      const { globalSettings: settings2 } = require('../src/cli/utils/global-settings');
      expect(settings2.port).toBe(9999);
    });
  });

  describe('Environment variable initialization', () => {
    test('should initialize port from PORT env var', () => {
      process.env.PORT = '3000';
      const { globalSettings } = require('../src/cli/utils/global-settings');
      expect(globalSettings.port).toBe(3000);
    });

    test('should initialize browser from BROWSER env var', () => {
      process.env.BROWSER = 'firefox';
      const { globalSettings } = require('../src/cli/utils/global-settings');
      expect(globalSettings.browser).toBe('firefox');
    });

    test('should initialize both port and browser from env vars', () => {
      process.env.PORT = '8080';
      process.env.BROWSER = 'chrome';
      const { globalSettings } = require('../src/cli/utils/global-settings');
      expect(globalSettings.port).toBe(8080);
      expect(globalSettings.browser).toBe('chrome');
    });

    test('should handle invalid PORT env var', () => {
      process.env.PORT = 'not-a-number';
      const { globalSettings } = require('../src/cli/utils/global-settings');
      expect(globalSettings.port).toBeUndefined();
    });

    test('should handle empty PORT env var', () => {
      process.env.PORT = '';
      const { globalSettings } = require('../src/cli/utils/global-settings');
      expect(globalSettings.port).toBeUndefined();
    });

    test('should handle PORT with leading/trailing spaces', () => {
      process.env.PORT = '  5000  ';
      const { globalSettings } = require('../src/cli/utils/global-settings');
      expect(globalSettings.port).toBe(5000);
    });

    test('should handle zero PORT', () => {
      process.env.PORT = '0';
      const { globalSettings } = require('../src/cli/utils/global-settings');
      expect(globalSettings.port).toBe(0);
    });

    test('should handle negative PORT', () => {
      process.env.PORT = '-1';
      const { globalSettings } = require('../src/cli/utils/global-settings');
      expect(globalSettings.port).toBe(-1);
    });

    test('should have undefined values when env vars not set', () => {
      const { globalSettings } = require('../src/cli/utils/global-settings');
      expect(globalSettings.port).toBeUndefined();
      expect(globalSettings.browser).toBeUndefined();
    });
  });

  describe('Getters and setters', () => {
    test('should get and set port', () => {
      const { globalSettings } = require('../src/cli/utils/global-settings');
      expect(globalSettings.port).toBeUndefined();
      
      globalSettings.port = 4000;
      expect(globalSettings.port).toBe(4000);
      
      globalSettings.port = undefined;
      expect(globalSettings.port).toBeUndefined();
    });

    test('should get and set browser', () => {
      const { globalSettings } = require('../src/cli/utils/global-settings');
      expect(globalSettings.browser).toBeUndefined();
      
      globalSettings.browser = 'safari';
      expect(globalSettings.browser).toBe('safari');
      
      globalSettings.browser = undefined;
      expect(globalSettings.browser).toBeUndefined();
    });

    test('should handle setting port to 0', () => {
      const { globalSettings } = require('../src/cli/utils/global-settings');
      globalSettings.port = 0;
      expect(globalSettings.port).toBe(0);
    });

    test('should handle setting empty string browser', () => {
      const { globalSettings } = require('../src/cli/utils/global-settings');
      globalSettings.browser = '';
      expect(globalSettings.browser).toBe('');
    });

    test('should handle setting browser with spaces', () => {
      const { globalSettings } = require('../src/cli/utils/global-settings');
      globalSettings.browser = 'Google Chrome';
      expect(globalSettings.browser).toBe('Google Chrome');
    });
  });

  describe('getAll method', () => {
    test('should return all settings', () => {
      const { globalSettings } = require('../src/cli/utils/global-settings');
      globalSettings.port = 5000;
      globalSettings.browser = 'edge';
      
      const all = globalSettings.getAll();
      expect(all).toEqual({
        port: 5000,
        browser: 'edge'
      });
    });

    test('should return copy of settings', () => {
      const { globalSettings } = require('../src/cli/utils/global-settings');
      globalSettings.port = 6000;
      globalSettings.browser = 'webkit';
      
      const all = globalSettings.getAll();
      all.port = 7000;
      all.browser = 'modified';
      
      // Original should not be modified
      expect(globalSettings.port).toBe(6000);
      expect(globalSettings.browser).toBe('webkit');
    });

    test('should return empty object when no settings', () => {
      const { globalSettings } = require('../src/cli/utils/global-settings');
      const all = globalSettings.getAll();
      expect(all).toEqual({});
    });

    test('should include undefined values in getAll', () => {
      const { globalSettings } = require('../src/cli/utils/global-settings');
      globalSettings.port = 8000;
      // browser is undefined
      
      const all = globalSettings.getAll();
      expect(all).toEqual({
        port: 8000
      });
      expect('browser' in all).toBe(false);
    });
  });

  describe('Edge cases', () => {
    test('should handle very large port numbers', () => {
      const { globalSettings } = require('../src/cli/utils/global-settings');
      globalSettings.port = 65535; // Max valid port
      expect(globalSettings.port).toBe(65535);
      
      globalSettings.port = 100000; // Beyond valid range
      expect(globalSettings.port).toBe(100000); // Still stores it
    });

    test('should handle special characters in browser', () => {
      const { globalSettings } = require('../src/cli/utils/global-settings');
      globalSettings.browser = '/usr/bin/chromium-browser --no-sandbox';
      expect(globalSettings.browser).toBe('/usr/bin/chromium-browser --no-sandbox');
    });

    test('should handle rapid get/set operations', () => {
      const { globalSettings } = require('../src/cli/utils/global-settings');
      
      for (let i = 0; i < 1000; i++) {
        globalSettings.port = i;
        expect(globalSettings.port).toBe(i);
      }
    });

    test('should handle alternating undefined and defined values', () => {
      const { globalSettings } = require('../src/cli/utils/global-settings');
      
      globalSettings.port = 3000;
      expect(globalSettings.port).toBe(3000);
      
      globalSettings.port = undefined;
      expect(globalSettings.port).toBeUndefined();
      
      globalSettings.port = 4000;
      expect(globalSettings.port).toBe(4000);
    });
  });

  describe('Type safety', () => {
    test('should store number types for port', () => {
      const { globalSettings } = require('../src/cli/utils/global-settings');
      globalSettings.port = 5000;
      expect(typeof globalSettings.port).toBe('number');
    });

    test('should store string types for browser', () => {
      const { globalSettings } = require('../src/cli/utils/global-settings');
      globalSettings.browser = 'chrome';
      expect(typeof globalSettings.browser).toBe('string');
    });

    test('should allow undefined for both properties', () => {
      const { globalSettings } = require('../src/cli/utils/global-settings');
      globalSettings.port = undefined;
      globalSettings.browser = undefined;
      expect(globalSettings.port).toBeUndefined();
      expect(globalSettings.browser).toBeUndefined();
    });
  });
});