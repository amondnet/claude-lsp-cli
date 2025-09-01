/**
 * High-impact test for diagnostic-capabilities.ts
 * Tests critical diagnostic capability definitions
 */

import { describe, test, expect } from "bun:test";
import { diagnosticCapabilities } from "../src/diagnostic-capabilities";

describe("Diagnostic Capabilities - Critical", () => {
  describe("Critical: Core Language Support", () => {
    test("should have capabilities for TypeScript", () => {
      const ts = diagnosticCapabilities.typescript;
      expect(ts).toBeDefined();
      expect(ts.scope).toBe("both");
      expect(ts.timing).toBe("real-time");
      expect(ts.features.typeChecking).toBe(true);
      expect(ts.features.syntaxErrors).toBe(true);
    });

    test("should have capabilities for Python", () => {
      const python = diagnosticCapabilities.python;
      expect(python).toBeDefined();
      expect(python.scope).toBe("file");
      expect(python.timing).toBe("on-save-open");
      expect(python.features.syntaxErrors).toBe(true);
      expect(python.features.linterIntegration).toContain("pylint");
    });

    test("should have capabilities for JavaScript", () => {
      const js = diagnosticCapabilities.javascript;
      expect(js).toBeDefined();
      expect(js.scope).toBe("both");
      expect(js.features.syntaxErrors).toBe(true);
    });

    test("should have capabilities for Rust", () => {
      const rust = diagnosticCapabilities.rust;
      expect(rust).toBeDefined();
      expect(rust.scope).toBe("project-wide");
      expect(rust.features.typeChecking).toBe(true);
    });
  });

  describe("Critical: Feature Completeness", () => {
    test("all capabilities should have required fields", () => {
      Object.entries(diagnosticCapabilities).forEach(([lang, caps]) => {
        // Core fields
        expect(caps.scope).toBeDefined();
        expect(['file', 'project-wide', 'both']).toContain(caps.scope);
        
        expect(caps.timing).toBeDefined();
        expect(['real-time', 'on-save', 'on-save-open', 'on-demand']).toContain(caps.timing);
        
        // Features object
        expect(caps.features).toBeDefined();
        expect(typeof caps.features).toBe("object");
        
        // At minimum should detect syntax errors
        expect(caps.features.syntaxErrors).toBeDefined();
      });
    });

    test("TypeScript should have full feature set", () => {
      const ts = diagnosticCapabilities.typescript;
      expect(ts.features.typeChecking).toBe(true);
      expect(ts.features.syntaxErrors).toBe(true);
      expect(ts.features.unusedCode).toBe(true);
      expect(ts.features.importValidation).toBe(true);
      expect(ts.features.documentationChecks).toBe(true);
      expect(Array.isArray(ts.features.linterIntegration)).toBe(true);
    });
  });

  describe("Critical: Performance Metadata", () => {
    test("languages with performance data should have valid values", () => {
      Object.entries(diagnosticCapabilities).forEach(([lang, caps]) => {
        if (caps.performance) {
          if (caps.performance.speed) {
            expect(['fast', 'moderate', 'slow']).toContain(caps.performance.speed);
          }
          if (caps.performance.memoryUsage) {
            expect(['low', 'moderate', 'high']).toContain(caps.performance.memoryUsage);
          }
          if (caps.performance.startupTime) {
            expect(['fast', 'moderate', 'slow']).toContain(caps.performance.startupTime);
          }
        }
      });
    });
  });

  describe("Critical: Project Requirements", () => {
    test("TypeScript should require tsconfig or jsconfig", () => {
      const ts = diagnosticCapabilities.typescript;
      expect(ts.requirements).toBeDefined();
      expect(ts.requirements?.projectConfig).toContain("tsconfig.json");
      expect(ts.requirements?.projectConfig).toContain("jsconfig.json");
    });

    test("Python should support multiple linters", () => {
      const python = diagnosticCapabilities.python;
      const linters = python.features.linterIntegration;
      expect(Array.isArray(linters)).toBe(true);
      expect(linters).toContain("pylint");
      expect(linters).toContain("flake8");
      expect(linters).toContain("mypy");
    });
  });

  describe("Critical: Language Coverage", () => {
    const criticalLanguages = [
      'typescript',
      'javascript', 
      'python',
      'rust',
      'go',
      'java',
      'cpp',
      'c'
    ];

    test.each(criticalLanguages)("should have capabilities for %s", (lang) => {
      expect(diagnosticCapabilities[lang]).toBeDefined();
      expect(diagnosticCapabilities[lang].features).toBeDefined();
    });
  });
});