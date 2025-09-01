#!/usr/bin/env bun

import { LSPClient } from './src/server-lsp-client';
import { resolve, join } from 'path';
import { existsSync } from 'fs';
import { logger } from './src/utils/logger';

// Enable debug logging
process.env.DEBUG = 'true';

const projectPath = resolve('./examples/typescript-project');
console.log('Testing TypeScript diagnostics for:', projectPath);

// Change to the project directory
process.chdir(projectPath);
console.log('Changed to directory:', process.cwd());

// Set project for logger
logger.setProject('test');

const client = new LSPClient('test');

// Open a TypeScript file with known errors
const testFile = join(projectPath, 'src/index.ts');
if (!existsSync(testFile)) {
  console.error('Test file not found:', testFile);
  process.exit(1);
}

console.log('\n📝 Opening file:', testFile);

try {
  // Start the language server and open the document
  await client.openDocument(testFile, true); // Wait for diagnostics
  
  console.log('\n⏳ Waiting for diagnostics...');
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  // Get diagnostics
  const diagnostics = client.getDiagnostics(testFile);
  console.log('\n📊 Diagnostics found:', diagnostics.length);
  
  // Check if server is running
  const servers = client.getActiveServers();
  console.log('🖥️  Active servers:', servers);
  
  // Check all diagnostics
  const allDiags = client.getAllDiagnostics();
  console.log('📋 All diagnostics map size:', allDiags.size);
  
  if (diagnostics.length > 0) {
    console.log('\n✅ First 5 diagnostics:');
    diagnostics.slice(0, 5).forEach((diag, i) => {
      console.log(`  ${i + 1}. Line ${diag.range.start.line + 1}: ${diag.message}`);
    });
  } else {
    console.log('\n❌ No diagnostics found!');
    console.log('This means the LSP server is not sending diagnostics.');
  }
} catch (error) {
  console.error('\n❌ Error:', error);
}

// Clean up
await client.stopAllServers();
process.exit(0);