#!/usr/bin/env bun

import { LSPClient } from "./src/lsp-client";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";

const TEST_DIR = join(import.meta.dir, "rust-test");

async function testRustServer() {
  console.log("Testing Rust (rust-analyzer) Language Server");
  console.log("============================================================");
  
  // Clean up and create test directory
  try {
    rmSync(TEST_DIR, { recursive: true, force: true });
  } catch {}
  mkdirSync(TEST_DIR, { recursive: true });
  
  // Create a Cargo.toml file (required for rust-analyzer)
  const cargoToml = `[package]
name = "test-project"
version = "0.1.0"
edition = "2021"

[dependencies]
`;
  writeFileSync(join(TEST_DIR, "Cargo.toml"), cargoToml);
  console.log("Created Cargo.toml");
  
  // Create src directory
  mkdirSync(join(TEST_DIR, "src"), { recursive: true });
  
  // Create a Rust test file with errors
  const rustFile = join(TEST_DIR, "src", "main.rs");
  const rustContent = `fn main() {
    let x: String = 123;  // Type error: i32 to String
    println!("{}", undefined_var);  // Undefined variable
    non_existent_function();  // Undefined function
    let y = x + 5;  // Type mismatch in operation
}`;
  
  writeFileSync(rustFile, rustContent);
  console.log("Created src/main.rs with intentional errors");
  
  // Start LSP client
  const client = new LSPClient();
  
  try {
    // Start Rust server
    console.log("Starting rust-analyzer...");
    await client.startLanguageServer("rust", TEST_DIR);
    console.log("✅ Rust server started");
    
    // Open the Rust file
    await client.openDocument(rustFile);
    console.log("📄 Opened src/main.rs");
    
    // Wait for diagnostics (rust-analyzer can be slow initially)
    console.log("Waiting for diagnostics (rust-analyzer needs time to analyze)...");
    for (let i = 0; i < 10; i++) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      const diagnostics = client.getDiagnostics(rustFile);
      console.log(`  Attempt ${i + 1}/10: ${diagnostics.length} diagnostics`);
      
      if (diagnostics.length > 0) {
        console.log(`\n✅ RUST WORKING! Found ${diagnostics.length} diagnostics:`);
        diagnostics.forEach(d => {
          console.log(`  - Line ${d.range.start.line + 1}: ${d.message}`);
        });
        break;
      }
    }
    
    const finalDiagnostics = client.getDiagnostics(rustFile);
    if (finalDiagnostics.length === 0) {
      console.log("\n❌ RUST NOT WORKING - No diagnostics received after 20 seconds");
      console.log("Possible issues:");
      console.log("  1. rust-analyzer might not be installed");
      console.log("  2. Cargo.toml might need more configuration");
      console.log("  3. rust-analyzer might need more time to index");
    }
    
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await client.stopAllServers();
    console.log("\nStopped rust-analyzer");
  }
}

testRustServer().catch(console.error);