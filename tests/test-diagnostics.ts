#!/usr/bin/env bun

import { LSPClient } from "./src/claude-code-lsp";
import { existsSync } from "fs";
import { join } from "path";

const projectRoot = "/Users/steven_chong/Downloads/repos/kepler_app_testhooks";

async function testDiagnostics() {
  const client = new LSPClient();
  
  console.log("Starting language servers...");
  await client.startTypeScriptServer(projectRoot);
  await client.startPythonServer(projectRoot);
  
  // Test TypeScript file
  const tsFile = join(projectRoot, "test-lsp.ts");
  if (existsSync(tsFile)) {
    console.log("\nOpening TypeScript file with errors...");
    await client.openDocument(tsFile, "typescript");
    
    // Wait for diagnostics
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const diagnostics = client.getDiagnostics(tsFile);
    console.log(`\nFound ${diagnostics.length} TypeScript diagnostics:`);
    diagnostics.forEach(d => {
      console.log(`  Line ${d.range.start.line + 1}: ${d.message}`);
    });
  }
  
  // Test Python file  
  const pyFile = join(projectRoot, "test.py");
  if (existsSync(pyFile)) {
    console.log("\nOpening Python file...");
    await client.openDocument(pyFile, "python");
    
    // Wait for diagnostics
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const diagnostics = client.getDiagnostics(pyFile);
    console.log(`\nFound ${diagnostics.length} Python diagnostics:`);
    diagnostics.forEach(d => {
      console.log(`  Line ${d.range.start.line + 1}: ${d.message}`);
    });
  }
  
  await client.shutdown();
  console.log("\nTest complete!");
}

testDiagnostics().catch(console.error);