#!/usr/bin/env bun

import { LSPClient } from "./src/lsp-client";
import { writeFileSync, mkdirSync, existsSync, rmSync } from "fs";
import { join } from "path";

const TEST_DIR = "/tmp/lsp-working-test";

async function testLanguage(name: string, lang: string, testFile: string, content: string) {
  console.log(`\nTesting ${name}...`);
  
  const testPath = join(TEST_DIR, testFile);
  writeFileSync(testPath, content);
  
  const client = new LSPClient();
  try {
    await client.startLanguageServer(lang, TEST_DIR);
    await client.openDocument(testPath);
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const diagnostics = client.getDiagnostics(testPath);
    if (diagnostics.length > 0) {
      console.log(`✅ ${name} WORKING - Found ${diagnostics.length} diagnostics`);
      return true;
    } else {
      console.log(`⚠️  ${name} - No diagnostics (may not detect this error)`);
      return false;
    }
  } catch (e: any) {
    console.log(`❌ ${name} FAILED - ${e.message}`);
    return false;
  } finally {
    await client.stopAllServers();
    if (existsSync(testPath)) rmSync(testPath);
  }
}

async function main() {
  if (!existsSync(TEST_DIR)) mkdirSync(TEST_DIR, { recursive: true });
  
  // Create package.json for TypeScript
  writeFileSync(join(TEST_DIR, "package.json"), '{"name":"test"}');
  
  const results = [];
  
  // Test the 6 "installed" languages
  results.push(await testLanguage(
    "TypeScript", "typescript", "test.ts", 
    "const x: string = 123;"
  ));
  
  results.push(await testLanguage(
    "Python", "python", "test.py",
    "def add(a: int) -> int:\n    return a + 'string'"
  ));
  
  results.push(await testLanguage(
    "Go", "go", "test.go",
    "package main\nfunc main() { var x int = \"string\" }"
  ));
  
  results.push(await testLanguage(
    "C++", "cpp", "test.cpp",
    "int main() { int x = \"string\"; }"
  ));
  
  results.push(await testLanguage(
    "Rust", "rust", "test.rs",
    "fn main() { let x: i32 = \"string\"; }"
  ));
  
  results.push(await testLanguage(
    "Swift", "swift", "test.swift",
    "let x: Int = \"string\""
  ));
  
  console.log("\n" + "=".repeat(50));
  console.log("RESULTS:");
  const working = results.filter(r => r).length;
  console.log(`Working: ${working} out of 6 tested`);
  console.log(`Actual working languages: ${working} out of 26 claimed`);
  
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
}

main().catch(console.error);