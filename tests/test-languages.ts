import { describe, test, expect } from "bun:test";
import { languageServers, detectProjectLanguages, isLanguageServerInstalled } from "../src/language-servers";
import { LSPClient } from "../src/lsp-client";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";

describe("Language Detection", () => {
  const testDir = "./test-projects";
  
  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });
  
  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });
  
  test("detects TypeScript project", () => {
    writeFileSync(join(testDir, "tsconfig.json"), "{}");
    const detected = detectProjectLanguages(testDir);
    expect(detected).toContain("typescript");
  });
  
  test("detects Python project", () => {
    writeFileSync(join(testDir, "requirements.txt"), "");
    const detected = detectProjectLanguages(testDir);
    expect(detected).toContain("python");
  });
  
  test("detects Go project", () => {
    writeFileSync(join(testDir, "go.mod"), "module test");
    const detected = detectProjectLanguages(testDir);
    expect(detected).toContain("go");
  });
  
  test("detects Rust project", () => {
    writeFileSync(join(testDir, "Cargo.toml"), "[package]");
    const detected = detectProjectLanguages(testDir);
    expect(detected).toContain("rust");
  });
  
  test("detects multiple languages", () => {
    writeFileSync(join(testDir, "package.json"), "{}");
    writeFileSync(join(testDir, "requirements.txt"), "");
    writeFileSync(join(testDir, "Cargo.toml"), "[package]");
    
    const detected = detectProjectLanguages(testDir);
    expect(detected).toContain("typescript");
    expect(detected).toContain("python");
    expect(detected).toContain("rust");
  });
});

describe("Language Server Configuration", () => {
  test("all languages have required fields", () => {
    for (const [lang, config] of Object.entries(languageServers)) {
      expect(config.name).toBeDefined();
      expect(config.command).toBeDefined();
      expect(config.extensions).toBeInstanceOf(Array);
      expect(config.extensions.length).toBeGreaterThan(0);
      expect(config.projectFiles).toBeInstanceOf(Array);
    }
  });
  
  test("installation check works for TypeScript", () => {
    // This will check if typescript-language-server is in node_modules
    const installed = isLanguageServerInstalled("typescript");
    // Just verify it returns a boolean
    expect(typeof installed).toBe("boolean");
  });
});

describe("LSPClient", () => {
  test("can instantiate client", () => {
    const client = new LSPClient();
    expect(client).toBeDefined();
    expect(client.getSupportedLanguages()).toContain("typescript");
    expect(client.getSupportedLanguages()).toContain("go");
    expect(client.getSupportedLanguages().length).toBe(27);
  });
  
  test("maps file extensions correctly", async () => {
    const client = new LSPClient();
    
    // Test extension mapping (without actually starting servers)
    const testCases = [
      { ext: ".ts", lang: "TypeScript" },
      { ext: ".py", lang: "Python" },
      { ext: ".go", lang: "Go" },
      { ext: ".rs", lang: "Rust" },
      { ext: ".java", lang: "Java" },
      { ext: ".cpp", lang: "C/C++" },
      { ext: ".rb", lang: "Ruby" },
      { ext: ".php", lang: "PHP" },
    ];
    
    for (const testCase of testCases) {
      const lang = Object.entries(languageServers).find(([_, config]) => 
        config.extensions.includes(testCase.ext)
      );
      expect(lang).toBeDefined();
      expect(lang![1].name).toBe(testCase.lang);
    }
  });
});