#!/usr/bin/env bun

// Manual test script to verify LSP functionality
import { LSPClient } from "./src/lsp-client";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

const TEST_DIR = "/tmp/lsp-test-manual";

async function test() {
  console.log("🧪 Testing LSP Client directly...\n");
  
  // Setup test directory
  if (!existsSync(TEST_DIR)) {
    mkdirSync(TEST_DIR, { recursive: true });
  }
  
  // Create test files
  writeFileSync(join(TEST_DIR, "package.json"), JSON.stringify({
    name: "test-project",
    version: "1.0.0"
  }));
  
  writeFileSync(join(TEST_DIR, "tsconfig.json"), JSON.stringify({
    compilerOptions: {
      target: "ES2022",
      module: "ESNext",
      strict: true
    }
  }));
  
  const testFile = join(TEST_DIR, "test.ts");
  writeFileSync(testFile, `
// This file has intentional errors
const message: string = 123; // Type error
console.log(mesage); // Typo error

function add(a: number, b: number): number {
  return a + b;
}

add("1", "2"); // Type error
`);
  
  // Create LSP client
  const client = new LSPClient();
  
  try {
    console.log("📘 Starting TypeScript language server...");
    await client.startLanguageServer('typescript', TEST_DIR);
    console.log("✅ TypeScript server started\n");
    
    console.log("📄 Opening test file...");
    await client.openDocument(testFile);
    console.log("✅ Document opened\n");
    
    // Wait for diagnostics
    console.log("⏳ Waiting for diagnostics...");
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log("📊 Getting diagnostics...");
    const diagnostics = client.getDiagnostics(testFile);
    
    if (diagnostics.length > 0) {
      console.log(`✅ Found ${diagnostics.length} diagnostics:\n`);
      diagnostics.forEach((d, i) => {
        console.log(`  ${i + 1}. Line ${d.range.start.line + 1}: ${d.message}`);
        console.log(`     Severity: ${d.severity === 1 ? 'Error' : d.severity === 2 ? 'Warning' : 'Info'}`);
      });
    } else {
      console.log("❌ No diagnostics found!");
    }
    
    console.log("\n📊 All diagnostics in the project:");
    const allDiagnostics = client.getAllDiagnostics();
    for (const [file, diags] of allDiagnostics) {
      console.log(`  File: ${file}`);
      console.log(`  Issues: ${diags.length}`);
    }
    
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    console.log("\n🛑 Stopping servers...");
    await client.stopAllServers();
    console.log("✅ Done");
  }
}

test().catch(console.error);