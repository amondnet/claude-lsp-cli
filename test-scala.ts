#!/usr/bin/env bun

import { LSPClient } from "./src/lsp-client";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";

const TEST_DIR = join(import.meta.dir, "scala-test");

async function testScalaServer() {
  console.log("Testing Scala (Metals) Language Server");
  console.log("============================================================");
  
  // Clean up and create test directory
  try {
    rmSync(TEST_DIR, { recursive: true, force: true });
  } catch {}
  mkdirSync(TEST_DIR, { recursive: true });
  
  // Create a simple build.sbt file (required for Metals)
  const buildSbt = `
scalaVersion := "3.3.0"

lazy val root = project
  .in(file("."))
  .settings(
    name := "test-project"
  )
`;
  writeFileSync(join(TEST_DIR, "build.sbt"), buildSbt);
  console.log("Created build.sbt");
  
  // Create a Scala test file with errors
  const scalaFile = join(TEST_DIR, "Test.scala");
  const scalaContent = `object Test {
  def main(args: Array[String]): Unit = {
    val x: String = 123  // Type error: Int to String
    println(undefinedVar)  // Undefined variable
    nonExistentMethod()  // Undefined method
  }
}`;
  
  writeFileSync(scalaFile, scalaContent);
  console.log("Created Test.scala with intentional errors");
  
  // Start LSP client
  const client = new LSPClient();
  
  try {
    // Start Scala server (will wait for Metals to be ready)
    console.log("Starting Metals (this will take time for initial build import)...");
    await client.startLanguageServer("scala", TEST_DIR);
    console.log("✅ Metals server started and ready");
    
    // Open the Scala file
    await client.openDocument(scalaFile);
    console.log("📄 Opened Test.scala");
    
    // Wait a bit for diagnostics
    console.log("Waiting for diagnostics...");
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Check diagnostics
    const diagnostics = client.getDiagnostics(scalaFile);
    
    if (diagnostics.length > 0) {
      console.log(`\n✅ SCALA WORKING! Found ${diagnostics.length} diagnostics:`);
      diagnostics.forEach(d => {
        console.log(`  - Line ${d.range.start.line + 1}: ${d.message}`);
      });
    } else {
      console.log("\n❌ SCALA NOT WORKING - No diagnostics received");
      console.log("Note: Even with proper setup, Metals may need more configuration");
    }
    
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await client.stopAllServers();
    console.log("\nStopped Metals server");
  }
}

testScalaServer().catch(console.error);