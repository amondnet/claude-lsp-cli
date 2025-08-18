#!/usr/bin/env bun

// Test all configured language servers
import { languageServers, isLanguageServerInstalled } from "./src/language-servers";
import { LSPClient } from "./src/lsp-client";
import { writeFileSync, mkdirSync, existsSync, rmSync } from "fs";
import { join } from "path";

const TEST_DIR = "/tmp/lsp-language-test";

// Test files with intentional errors for each language
const testFiles = {
  typescript: {
    file: "test.ts",
    content: `const x: string = 123; // Type error`
  },
  python: {
    file: "test.py", 
    content: `def add(a: int) -> int:\n    return a + "string"  # Type error`
  },
  rust: {
    file: "test.rs",
    content: `fn main() { let x: i32 = "string"; }  // Type error`
  },
  go: {
    file: "test.go",
    content: `package main\nfunc main() { var x int = "string" }  // Type error`
  },
  java: {
    file: "Test.java",
    content: `public class Test { public static void main(String[] args) { int x = "string"; } }`
  },
  cpp: {
    file: "test.cpp",
    content: `int main() { int x = "string"; return 0; }  // Type error`
  },
  ruby: {
    file: "test.rb",
    content: `def add(a)\n  a + undefined_variable\nend`
  },
  php: {
    file: "test.php",
    content: `<?php $x = undefined_function(); ?>`
  },
  html: {
    file: "test.html",
    content: `<html><body><undefined-tag>Test</undefined-tag></body></html>`
  },
  css: {
    file: "test.css",
    content: `.class { colr: red; /* Typo */ }`
  },
  json: {
    file: "test.json",
    content: `{ "key": "value", }  // Trailing comma`
  },
  yaml: {
    file: "test.yaml",
    content: `key: value\n  invalid: indentation`
  }
};

async function testLanguage(lang: string, config: any) {
  console.log(`\n${"=".repeat(50)}`);
  console.log(`Testing ${config.name} (${lang})`);
  console.log(`${"=".repeat(50)}`);
  
  // Check if installed
  const installed = isLanguageServerInstalled(lang);
  console.log(`✓ Installed: ${installed ? "Yes" : "No"}`);
  
  if (!installed) {
    console.log(`  Install command: ${config.installCommand || "Manual installation required"}`);
    if (config.manualInstallUrl) {
      console.log(`  Manual install: ${config.manualInstallUrl}`);
    }
    
    // Try to auto-install if possible
    if (config.installCommand && !config.requiresGlobal) {
      console.log(`  Attempting auto-install...`);
      try {
        const client = new LSPClient();
        await client.startLanguageServer(lang, TEST_DIR);
        console.log(`  ✅ Auto-installed successfully!`);
      } catch (e: any) {
        console.log(`  ❌ Auto-install failed: ${e.message}`);
        return;
      }
    } else {
      return;
    }
  }
  
  // Create test file if we have one
  const testFile = testFiles[lang as keyof typeof testFiles];
  if (!testFile) {
    console.log(`  ⚠️  No test file configured for ${lang}`);
    return;
  }
  
  const testPath = join(TEST_DIR, testFile.file);
  writeFileSync(testPath, testFile.content);
  
  // Try to start the language server
  const client = new LSPClient();
  try {
    console.log(`  Starting language server...`);
    await client.startLanguageServer(lang, TEST_DIR);
    console.log(`  ✅ Server started`);
    
    // Open document
    await client.openDocument(testPath);
    
    // Wait for diagnostics
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Get diagnostics
    const diagnostics = client.getDiagnostics(testPath);
    if (diagnostics.length > 0) {
      console.log(`  ✅ Diagnostics working! Found ${diagnostics.length} issues`);
      diagnostics.slice(0, 2).forEach(d => {
        console.log(`     - Line ${d.range.start.line + 1}: ${d.message}`);
      });
    } else {
      console.log(`  ⚠️  No diagnostics found (server may not support this file type)`);
    }
    
    await client.stopAllServers();
  } catch (e: any) {
    console.log(`  ❌ Failed to start: ${e.message}`);
  }
  
  // Clean up test file
  if (existsSync(testPath)) {
    rmSync(testPath);
  }
}

async function main() {
  console.log("🧪 Testing all configured language servers...\n");
  
  // Setup test directory
  if (!existsSync(TEST_DIR)) {
    mkdirSync(TEST_DIR, { recursive: true });
  }
  
  // Create a basic package.json for Node-based servers
  writeFileSync(join(TEST_DIR, "package.json"), JSON.stringify({
    name: "test-project",
    version: "1.0.0"
  }));
  
  const results = {
    working: [] as string[],
    notInstalled: [] as string[],
    failed: [] as string[]
  };
  
  // Test each language
  for (const [lang, config] of Object.entries(languageServers)) {
    try {
      await testLanguage(lang, config);
      
      if (isLanguageServerInstalled(lang)) {
        results.working.push(lang);
      } else {
        results.notInstalled.push(lang);
      }
    } catch (e) {
      results.failed.push(lang);
    }
  }
  
  // Summary
  console.log(`\n${"=".repeat(50)}`);
  console.log("SUMMARY");
  console.log(`${"=".repeat(50)}`);
  console.log(`✅ Working: ${results.working.length} languages`);
  results.working.forEach(l => console.log(`   - ${l}`));
  console.log(`\n⚠️  Not Installed: ${results.notInstalled.length} languages`);
  results.notInstalled.forEach(l => console.log(`   - ${l}`));
  if (results.failed.length > 0) {
    console.log(`\n❌ Failed: ${results.failed.length} languages`);
    results.failed.forEach(l => console.log(`   - ${l}`));
  }
  
  // Clean up
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true });
  }
}

main().catch(console.error);