#!/usr/bin/env bun

import { LSPClient } from "./src/lsp-client";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";

const TEST_DIR = join(import.meta.dir, "test-all");

// Languages that are verified to work
const WORKING_LANGUAGES = [
  { 
    name: "TypeScript",
    ext: ".ts",
    content: `const x: string = 123;  // Type error
console.log(undefinedVar);  // Undefined variable`,
    expectedErrors: 2
  },
  {
    name: "JavaScript", 
    ext: ".js",
    content: `const x = undefinedVar;  // Undefined variable
nonExistentFunc();  // Undefined function`,
    expectedErrors: 2
  },
  {
    name: "Go",
    ext: ".go",
    setupFiles: { "go.mod": `module test\ngo 1.21` },
    content: `package main
func main() {
    var x string = 123  // Type error
    fmt.Println(undefinedVar)  // Undefined
}`,
    expectedErrors: 2
  },
  {
    name: "C++",
    ext: ".cpp",
    content: `int main() {
    std::string x = 123;  // Type error
    undefinedVar = 5;  // Undefined
    return 0;
}`,
    expectedErrors: 2
  },
  {
    name: "PHP",
    ext: ".php",
    content: `<?php
$x = undefinedFunction();  // Undefined function
echo $undefinedVar;  // Undefined variable`,
    expectedErrors: 2
  },
  {
    name: "Scala",
    ext: ".scala",
    setupFiles: { 
      "build.sbt": `scalaVersion := "3.3.0"\nlazy val root = project.in(file(".")).settings(name := "test")`
    },
    content: `object Test {
  def main(args: Array[String]): Unit = {
    val x: String = 123  // Type error
    println(undefinedVar)  // Undefined
  }
}`,
    expectedErrors: 1,  // Metals only reports the type error
    slow: true  // Metals needs time to index
  }
];

async function testAllWorkingLanguages() {
  console.log("Testing All Working Language Servers");
  console.log("=" .repeat(60));
  
  // Clean up and create test directory
  try {
    rmSync(TEST_DIR, { recursive: true, force: true });
  } catch {}
  mkdirSync(TEST_DIR, { recursive: true });
  
  const client = new LSPClient();
  const results: {name: string, status: string}[] = [];
  
  for (const lang of WORKING_LANGUAGES) {
    console.log(`\nTesting ${lang.name}...`);
    
    // Create language-specific subdirectory
    const langDir = join(TEST_DIR, lang.name.toLowerCase());
    mkdirSync(langDir, { recursive: true });
    
    // Setup any required files
    if (lang.setupFiles) {
      for (const [file, content] of Object.entries(lang.setupFiles)) {
        writeFileSync(join(langDir, file), content);
      }
    }
    
    // Create test file
    const testFile = join(langDir, `test${lang.ext}`);
    writeFileSync(testFile, lang.content);
    
    try {
      // Start language server
      const language = lang.name.toLowerCase();
      await client.startLanguageServer(language, langDir);
      
      // Open document
      await client.openDocument(testFile);
      
      // Wait for diagnostics (longer for slow servers)
      await new Promise(resolve => setTimeout(resolve, lang.slow ? 20000 : 3000));
      
      // Check diagnostics
      const diagnostics = client.getDiagnostics(testFile);
      
      if (diagnostics.length >= lang.expectedErrors) {
        console.log(`✅ ${lang.name} WORKING - Found ${diagnostics.length} diagnostics`);
        results.push({name: lang.name, status: "✅ Working"});
      } else {
        console.log(`⚠️ ${lang.name} - Found ${diagnostics.length} diagnostics (expected ${lang.expectedErrors})`);
        results.push({name: lang.name, status: `⚠️ Partial (${diagnostics.length}/${lang.expectedErrors})`});
      }
      
    } catch (error) {
      console.error(`❌ ${lang.name} - Error:`, error);
      results.push({name: lang.name, status: "❌ Failed"});
    }
  }
  
  // Stop all servers
  await client.stopAllServers();
  
  // Print summary
  console.log("\n" + "=".repeat(60));
  console.log("SUMMARY - Working Languages:");
  console.log("=".repeat(60));
  for (const result of results) {
    console.log(`${result.status} ${result.name}`);
  }
  
  const working = results.filter(r => r.status.includes("✅")).length;
  console.log(`\nTotal: ${working}/${results.length} languages fully working`);
}

testAllWorkingLanguages().catch(console.error);