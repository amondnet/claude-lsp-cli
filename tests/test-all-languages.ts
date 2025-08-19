#!/usr/bin/env bun

import { join, extname } from "path";
import { existsSync, mkdirSync, rmSync } from "fs";
import { LSPClient } from "../src/lsp-client";
import { languageServers } from "../src/language-servers";

const TEST_DIR = join(import.meta.dir, "language-tests");

// Helper function to get language from file extension
function getLanguageFromExtension(filePath: string): string | null {
  const ext = extname(filePath);
  for (const [language, config] of Object.entries(languageServers)) {
    if (config.extensions.includes(ext)) {
      return language;
    }
  }
  return null;
}

interface TestFile {
  name: string;
  content: string;
  expectedDiagnostics: number;
  diagnosticPattern?: RegExp;
}

interface LanguageTest {
  language: string;
  extensions: string[];
  testFiles: TestFile[];
  requiresInstall?: string;
}

const LANGUAGE_TESTS: LanguageTest[] = [
  {
    language: "TypeScript",
    extensions: [".ts", ".tsx"],
    testFiles: [
      {
        name: "test.ts",
        content: `const x: string = 123; // Type error
function test() {
  return undefinedVariable; // Undefined variable
}`,
        expectedDiagnostics: 2,
        diagnosticPattern: /Type|undefined/i
      }
    ]
  },
  {
    language: "Python",
    extensions: [".py"],
    testFiles: [
      {
        name: "test.py",
        content: `def test() -> str:
    return 123  # Type error: returning int instead of str

x: int = "hello"  # Type error: assigning str to int
print(undefined_var)  # Name error`,
        expectedDiagnostics: 3,
        diagnosticPattern: /type|undefined|name/i
      }
    ]
  },
  {
    language: "Go",
    extensions: [".go"],
    testFiles: [
      {
        name: "test.go",
        content: `package main

func main() {
    var x string = 123  // Type error
    fmt.Println(x)      // Undefined fmt
    y := undefinedFunc() // Undefined function
}`,
        expectedDiagnostics: 3,
        diagnosticPattern: /undefined|cannot use|type/i
      }
    ],
    requiresInstall: "gopls"
  },
  {
    language: "Rust",
    extensions: [".rs"],
    testFiles: [
      {
        name: "main.rs",
        content: `fn main() {
    let x: String = 123;  // Type error
    println!("{}", undefined_var);  // Undefined variable
    nonexistent_function();  // Undefined function
}`,
        expectedDiagnostics: 3,
        diagnosticPattern: /expected|cannot find|undefined/i
      }
    ],
    requiresInstall: "rust-analyzer"
  },
  {
    language: "C++",
    extensions: [".cpp", ".cc"],
    testFiles: [
      {
        name: "test.cpp",
        content: `#include <iostream>

int main() {
    std::string x = 123;  // Type error
    std::cout << undefined_var;  // Undefined variable
    nonexistent_function();  // Undefined function
    return 0;
}`,
        expectedDiagnostics: 3,
        diagnosticPattern: /undeclared|undefined|cannot convert/i
      }
    ],
    requiresInstall: "clangd"
  },
  {
    language: "JavaScript",
    extensions: [".js", ".jsx"],
    testFiles: [
      {
        name: "test.js",
        content: `const x = undefined_variable;  // Undefined variable
function test() {
  return this.nonexistent.property;  // Potential null reference
}
test(1, 2, 3, 4, 5);  // Too many arguments`,
        expectedDiagnostics: 2,  // JS is more permissive
        diagnosticPattern: /undefined|cannot read/i
      }
    ]
  },
  {
    language: "Java",
    extensions: [".java"],
    testFiles: [
      {
        name: "Test.java",
        content: `public class Test {
    public static void main(String[] args) {
        String x = 123;  // Type error
        System.out.println(undefinedVar);  // Undefined variable
        nonexistentMethod();  // Undefined method
    }
}`,
        expectedDiagnostics: 3,
        diagnosticPattern: /cannot find|incompatible types|undefined/i
      }
    ],
    requiresInstall: "jdtls"
  },
  {
    language: "Ruby",
    extensions: [".rb"],
    testFiles: [
      {
        name: "test.rb",
        content: `def test
  undefined_variable  # Undefined variable
  1 + "string"  # Type error
  nonexistent_method  # Undefined method
end

test(1, 2, 3)  # Wrong number of arguments`,
        expectedDiagnostics: 2,  // Ruby is dynamic
        diagnosticPattern: /undefined|wrong number/i
      }
    ],
    requiresInstall: "solargraph"
  },
  {
    language: "PHP",
    extensions: [".php"],
    testFiles: [
      {
        name: "test.php",
        content: `<?php
function test(): string {
    return 123;  // Type error
}

echo $undefined_var;  // Undefined variable
nonexistent_function();  // Undefined function
?>`,
        expectedDiagnostics: 3,
        diagnosticPattern: /undefined|type|cannot find/i
      }
    ]
  },
  {
    language: "C#",
    extensions: [".cs"],
    testFiles: [
      {
        name: "Test.cs",
        content: `using System;

class Test {
    static void Main() {
        string x = 123;  // Type error
        Console.WriteLine(undefinedVar);  // Undefined variable
        NonexistentMethod();  // Undefined method
    }
}`,
        expectedDiagnostics: 3,
        diagnosticPattern: /cannot convert|does not exist|undefined/i
      }
    ],
    requiresInstall: "omnisharp"
  }
];

async function testLanguageServer(test: LanguageTest): Promise<boolean> {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Testing ${test.language} Language Server`);
  console.log(`${"=".repeat(60)}`);

  // Create test directory
  const testDir = join(TEST_DIR, test.language.toLowerCase());
  if (existsSync(testDir)) {
    rmSync(testDir, { recursive: true });
  }
  mkdirSync(testDir, { recursive: true });

  // Write test files
  for (const file of test.testFiles) {
    const filePath = join(testDir, file.name);
    await Bun.write(filePath, file.content);
    console.log(`Created test file: ${file.name}`);
  }

  // Create LSP client
  const client = new LSPClient();
  
  try {
    // Detect languages from test files
    const detectedLanguages = new Set<string>();
    for (const file of test.testFiles) {
      const filePath = join(testDir, file.name);
      const language = getLanguageFromExtension(filePath);
      if (language) {
        detectedLanguages.add(language);
      }
    }
    
    const languages = Array.from(detectedLanguages);
    
    if (languages.length === 0) {
      console.log(`❌ ${test.language}: No languages detected for test files`);
      return false;
    }
    
    console.log(`Detected languages: ${languages.join(", ")}`);
    
    // Start language server for each detected language
    for (const lang of languages) {
      await client.startLanguageServer(lang, testDir);
    }
    
    console.log(`✅ LSP client started for ${test.language}`);
    
    // Wait for initialization
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Open test files and get diagnostics
    let totalDiagnostics = 0;
    let hasExpectedErrors = false;

    for (const file of test.testFiles) {
      const filePath = join(testDir, file.name);
      
      // Open document
      await client.openDocument(filePath);
      console.log(`Opened document: ${file.name}`);
      
      // Wait for diagnostics (Python needs more time)
      const waitTime = test.language === "Python" ? 5000 : 2000;
      console.log(`Waiting ${waitTime}ms for diagnostics...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      
      // Get diagnostics
      const diagnostics = client.getDiagnostics(filePath);
      totalDiagnostics += diagnostics.length;
      
      console.log(`Diagnostics for ${file.name}: ${diagnostics.length}`);
      
      if (diagnostics.length > 0) {
        diagnostics.forEach(d => {
          console.log(`  - [${d.severity}] Line ${d.range.start.line + 1}: ${d.message}`);
          if (file.diagnosticPattern && file.diagnosticPattern.test(d.message)) {
            hasExpectedErrors = true;
          }
        });
      }
    }

    // Evaluate results
    const success = totalDiagnostics > 0 && (hasExpectedErrors || !test.testFiles[0].diagnosticPattern);
    
    if (success) {
      console.log(`✅ ${test.language}: WORKING - Found ${totalDiagnostics} diagnostics`);
    } else {
      console.log(`❌ ${test.language}: NOT WORKING - Expected diagnostics but got ${totalDiagnostics}`);
      if (test.requiresInstall) {
        console.log(`   💡 May need to install: ${test.requiresInstall}`);
      }
    }

    // Stop all servers
    await client.stopAllServers();
    
    return success;

  } catch (error) {
    console.error(`❌ ${test.language}: FAILED - ${error.message}`);
    if (test.requiresInstall) {
      console.log(`   💡 May need to install: ${test.requiresInstall}`);
    }
    
    try {
      await client.stopAllServers();
    } catch {}
    
    return false;
  } finally {
    // Clean up test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
  }
}

async function main() {
  console.log("Claude Code LSP - Comprehensive Language Server Test Suite");
  console.log("Testing all configured language servers...\n");

  const results: { language: string; status: boolean }[] = [];

  for (const test of LANGUAGE_TESTS) {
    const success = await testLanguageServer(test);
    results.push({ language: test.language, status: success });
    
    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Print summary
  console.log(`\n${"=".repeat(60)}`);
  console.log("TEST SUMMARY");
  console.log(`${"=".repeat(60)}`);
  
  const working = results.filter(r => r.status);
  const notWorking = results.filter(r => !r.status);
  
  console.log(`\n✅ WORKING (${working.length}/${results.length}):`);
  working.forEach(r => console.log(`   - ${r.language}`));
  
  console.log(`\n❌ NOT WORKING (${notWorking.length}/${results.length}):`);
  notWorking.forEach(r => console.log(`   - ${r.language}`));
  
  console.log(`\nSuccess rate: ${((working.length / results.length) * 100).toFixed(1)}%`);
  
  // Exit with appropriate code
  process.exit(notWorking.length > 0 ? 1 : 0);
}

if (import.meta.main) {
  main().catch(console.error);
}