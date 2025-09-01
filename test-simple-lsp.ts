#!/usr/bin/env bun

// Direct test of TypeScript language server
import { spawn } from 'child_process';
import { resolve } from 'path';
import * as rpc from 'vscode-jsonrpc/node';

console.log('Starting TypeScript Language Server directly...\n');

// Start the server
const serverProcess = spawn('typescript-language-server', ['--stdio'], {
  cwd: resolve('./examples/typescript-project'),
  stdio: ['pipe', 'pipe', 'pipe']
});

// Set up JSON-RPC connection
const connection = rpc.createMessageConnection(
  new rpc.StreamMessageReader(serverProcess.stdout),
  new rpc.StreamMessageWriter(serverProcess.stdin)
);

// Log server errors
serverProcess.stderr.on('data', (data) => {
  console.error('Server stderr:', data.toString());
});

// Track diagnostics
let diagnosticsReceived = false;
let diagnosticCount = 0;

// Listen for diagnostics
connection.onNotification("textDocument/publishDiagnostics", (params: any) => {
  console.log('\n✅ Received diagnostics for:', params.uri);
  console.log('   Number of issues:', params.diagnostics.length);
  diagnosticsReceived = true;
  diagnosticCount += params.diagnostics.length;
  
  if (params.diagnostics.length > 0) {
    console.log('\n   First 3 issues:');
    params.diagnostics.slice(0, 3).forEach((d: any, i: number) => {
      console.log(`   ${i + 1}. Line ${d.range.start.line + 1}: ${d.message}`);
    });
  }
});

connection.listen();

// Initialize the server
const rootPath = resolve('./examples/typescript-project');
const initParams = {
  processId: process.pid,
  rootUri: `file://${rootPath}`,
  capabilities: {
    textDocument: {
      publishDiagnostics: {
        relatedInformation: true,
        versionSupport: true,
        codeDescriptionSupport: true,
        dataSupport: true
      }
    }
  },
  workspaceFolders: [{
    uri: `file://${rootPath}`,
    name: "workspace"
  }],
  initializationOptions: {
    preferences: {
      includeInlayParameterNameHints: "all"
    }
  }
};

console.log('Initializing server...');
const initResult = await connection.sendRequest("initialize", initParams);
console.log('Server initialized');

await connection.sendNotification("initialized", {});

// Open the test file
const testFile = resolve('./examples/typescript-project/src/index.ts');
const content = await Bun.file(testFile).text();

console.log('\nOpening test file:', testFile);
await connection.sendNotification("textDocument/didOpen", {
  textDocument: {
    uri: `file://${testFile}`,
    languageId: 'typescript',
    version: 1,
    text: content
  }
});

// Wait for diagnostics
console.log('\nWaiting for diagnostics...');
await new Promise(resolve => setTimeout(resolve, 3000));

if (!diagnosticsReceived) {
  console.log('\n❌ No diagnostics received!');
} else {
  console.log(`\n✅ Total diagnostics received: ${diagnosticCount}`);
}

// Clean up
connection.dispose();
serverProcess.kill();

process.exit(diagnosticsReceived ? 0 : 1);