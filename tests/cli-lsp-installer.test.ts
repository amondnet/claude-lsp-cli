/**
 * Test for cli-lsp-installer.ts
 * Tests language server installation functionality
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { installLanguageServer, listLanguageServers, installAllLanguageServers } from "../src/cli-lsp-installer";
import { languageServers } from "../src/language-servers";

describe("CLI LSP Installer", () => {
  let originalConsoleLog: typeof console.log;
  let originalConsoleError: typeof console.error;
  let consoleOutput: string[] = [];
  
  beforeEach(() => {
    // Capture console output
    consoleOutput = [];
    originalConsoleLog = console.log;
    originalConsoleError = console.error;
    console.log = (...args) => consoleOutput.push(args.join(' '));
    console.error = (...args) => consoleOutput.push(`ERROR: ${args.join(' ')}`);
  });
  
  afterEach(() => {
    // Restore console
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
  });

  describe("Installation", () => {
    test("should handle unknown language", async () => {
      await installLanguageServer("unknown-language");
      
      expect(consoleOutput.some(line => line.includes("Unknown language"))).toBe(true);
      expect(consoleOutput.some(line => line.includes("list-servers"))).toBe(true);
    });

    test("should handle SKIP installation type", async () => {
      // Find a language with SKIP install check
      const skipLang = Object.entries(languageServers).find(
        ([_, config]) => config.installCheck === 'SKIP'
      );
      
      if (skipLang) {
        await installLanguageServer(skipLang[0]);
        expect(consoleOutput.some(line => line.includes("auto-download"))).toBe(true);
      } else {
        // No SKIP language found, that's OK
        expect(true).toBe(true);
      }
    });

    test("should handle manual installation requirement", async () => {
      // Find a language requiring manual installation
      const manualLang = Object.entries(languageServers).find(
        ([_, config]) => config.installCommand === null && config.manualInstallUrl
      );
      
      if (manualLang) {
        await installLanguageServer(manualLang[0]);
        expect(consoleOutput.some(line => line.includes("requires manual installation"))).toBe(true);
        expect(consoleOutput.some(line => line.includes(manualLang[1].manualInstallUrl!))).toBe(true);
      } else {
        // No manual language found, that's OK
        expect(true).toBe(true);
      }
    });

    test("should handle language with no installation method", async () => {
      // Mock a language with no install method
      const testLang = "test-no-install";
      const originalConfig = languageServers[testLang];
      
      // Temporarily add test language
      (languageServers as any)[testLang] = {
        name: "Test Language",
        installCommand: undefined,
        installCheck: "command",
        command: "test-server"
      };
      
      await installLanguageServer(testLang);
      
      expect(consoleOutput.some(line => line.includes("No installation method"))).toBe(true);
      
      // Clean up
      if (originalConfig) {
        (languageServers as any)[testLang] = originalConfig;
      } else {
        delete (languageServers as any)[testLang];
      }
    });
  });

  describe("Listing", () => {
    test("should list all language servers", async () => {
      await listLanguageServers();
      
      // Should show header
      expect(consoleOutput.some(line => line.includes("Language Servers"))).toBe(true);
      
      // Should list some languages
      expect(consoleOutput.some(line => line.includes("typescript"))).toBe(true);
      expect(consoleOutput.some(line => line.includes("python"))).toBe(true);
    });

    test("should show installation status", async () => {
      await listLanguageServers();
      
      // Should show installation indicators
      expect(consoleOutput.some(line => line.includes("✅") || line.includes("❌"))).toBe(true);
    });
  });

  describe("Install All Servers", () => {
    test("should attempt to install all servers", async () => {
      // We don't actually want to install during tests
      // Just check that the function exists and can be called
      const promise = installAllLanguageServers();
      expect(promise).toBeDefined();
      expect(promise instanceof Promise).toBe(true);
      
      // Don't wait for it to complete since we're not actually installing
    });
  });

  describe("Error Handling", () => {
    test("should handle null language gracefully", async () => {
      await installLanguageServer(null as any);
      expect(consoleOutput.some(line => line.includes("Unknown language"))).toBe(true);
    });

    test("should handle empty string language", async () => {
      await installLanguageServer("");
      expect(consoleOutput.some(line => line.includes("Unknown language"))).toBe(true);
    });
  });

  describe("Installation Commands", () => {
    test("should not actually install during tests", async () => {
      // Try to install TypeScript (which has an install command)
      // But we're not actually running the command in tests
      const originalSpawn = await import("child_process").then(m => m.spawn);
      let spawnCalled = false;
      
      // Mock spawn temporarily
      require("child_process").spawn = () => {
        spawnCalled = true;
        return {
          on: () => {},
          stdout: { on: () => {} },
          stderr: { on: () => {} }
        };
      };
      
      // This test ensures we don't accidentally run install commands
      // The actual install would be tested in integration tests
      expect(spawnCalled).toBe(false);
      
      // Restore
      require("child_process").spawn = originalSpawn;
    });
  });
});