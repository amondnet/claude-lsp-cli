#!/usr/bin/env bun

import { LSPClient } from './src/server-lsp-client';
import { resolve, join } from 'path';
import { existsSync } from 'fs';

const projectPath = resolve('./examples/typescript-project');
console.log('Testing TypeScript diagnostics for:', projectPath);

const client = new LSPClient('test');

// Open a TypeScript file with known errors
const testFile = join(projectPath, 'src/index.ts');
if (!existsSync(testFile)) {
  console.error('Test file not found:', testFile);
  process.exit(1);
}

console.log('Opening file:', testFile);

// Start the language server and open the document
await client.openDocument(testFile, true); // Wait for diagnostics

// Wait a bit more to ensure diagnostics are processed
console.log('Waiting for diagnostics to be processed...');
await new Promise(resolve => setTimeout(resolve, 3000));

// Get diagnostics
const diagnostics = client.getDiagnostics(testFile);
console.log('\nDiagnostics found:', diagnostics.length);

if (diagnostics.length > 0) {
  console.log('\nFirst 5 diagnostics:');
  diagnostics.slice(0, 5).forEach((diag, i) => {
    console.log(`${i + 1}. Line ${diag.range.start.line + 1}: ${diag.message}`);
  });
} else {
  console.log('\n❌ No diagnostics found! This is the problem.');
  
  // Check if server is running
  const servers = client.getActiveServers();
  console.log('\nActive servers:', servers);
  
  // Check all diagnostics
  const allDiags = client.getAllDiagnostics();
  console.log('All diagnostics map size:', allDiags.size);
  for (const [file, diags] of allDiags) {
    console.log(`  ${file}: ${diags.length} diagnostics`);
  }
}

// Clean up
await client.stopAllServers();
process.exit(diagnostics.length > 0 ? 0 : 1);