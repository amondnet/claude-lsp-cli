#!/usr/bin/env bun

import { LSPClient } from "../src/lsp-client";

async function main() {
  const client = new LSPClient();
  
  console.log("Starting TypeScript Language Server...");
  
  // Start TypeScript server for current directory
  await client.startLanguageServer("typescript", process.cwd());
  
  // Open a TypeScript file
  const testFile = "./src/index.ts";
  console.log(`Opening file: ${testFile}`);
  await client.openDocument(testFile);
  
  // Wait a bit for diagnostics to be computed
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Get diagnostics
  const diagnostics = client.getDiagnostics(testFile);
  
  if (diagnostics.length === 0) {
    console.log("✅ No issues found!");
  } else {
    console.log(`Found ${diagnostics.length} issues:`);
    diagnostics.forEach((diag: any, i: number) => {
      console.log(`  ${i + 1}. [${diag.severity}] Line ${diag.range.start.line + 1}: ${diag.message}`);
    });
  }
  
  // Cleanup
  await client.stopAllServers();
}

main().catch(console.error);