#!/usr/bin/env bun

import { LSPClient } from "../src/lsp-client";
import { join } from "path";

const projectRoot = "/Users/steven_chong/Downloads/repos/kepler_app_testhooks";

async function debugLSP() {
  console.log("Starting debug LSP test...");
  
  const client = new LSPClient();
  
  // Monkey-patch the handleDiagnostics to see what's happening
  const originalHandle = client['handleDiagnostics'].bind(client);
  (client as any).handleDiagnostics = function(uri: string, diagnostics: any[]) {
    console.log("\n🔍 DIAGNOSTICS RECEIVED:");
    console.log("  URI:", uri);
    console.log("  Count:", diagnostics.length);
    if (diagnostics.length > 0) {
      console.log("  First diagnostic:", JSON.stringify(diagnostics[0], null, 2));
    }
    return originalHandle(uri, diagnostics);
  };
  
  console.log("\n1. Starting TypeScript server...");
  await client.startTypeScriptServer(projectRoot);
  
  console.log("\n2. Waiting for server to fully initialize...");
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  const testFile = join(projectRoot, "test-lsp.ts");
  console.log("\n3. Opening document:", testFile);
  await client.openDocument(testFile, "typescript");
  
  console.log("\n4. Waiting for diagnostics...");
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  console.log("\n5. Checking stored diagnostics:");
  const storedDiagnostics = client.getDiagnostics();
  console.log("  Total stored diagnostics:", storedDiagnostics.length);
  
  // Also check the internal map directly
  const diagnosticsMap = (client as any).diagnostics as Map<string, any[]>;
  console.log("\n6. Diagnostics map contents:");
  for (const [key, value] of diagnosticsMap.entries()) {
    console.log(`  ${key}: ${value.length} diagnostics`);
  }
  
  console.log("\n7. Sending workspace/didChangeConfiguration...");
  // Try to trigger diagnostics with configuration change
  const servers = (client as any).servers as Map<string, any>;
  const tsServer = servers.get("typescript");
  if (tsServer?.connection) {
    await tsServer.connection.sendNotification("workspace/didChangeConfiguration", {
      settings: {}
    });
    console.log("  Configuration change sent");
  }
  
  console.log("\n8. Waiting again for diagnostics...");
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  const finalDiagnostics = client.getDiagnostics();
  console.log("\n9. Final diagnostics count:", finalDiagnostics.length);
  
  // Try requesting diagnostics explicitly (if supported)
  if (tsServer?.connection) {
    console.log("\n10. Trying to request diagnostics explicitly...");
    try {
      const result = await tsServer.connection.sendRequest("textDocument/diagnostic", {
        textDocument: { uri: `file://${testFile}` }
      });
      console.log("  Diagnostic request result:", result);
    } catch (e) {
      console.log("  Diagnostic request not supported:", e.message);
    }
  }
  
  await client.shutdown();
  console.log("\nDebug test complete!");
}

debugLSP().catch(console.error);