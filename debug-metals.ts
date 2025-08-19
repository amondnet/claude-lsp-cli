#!/usr/bin/env bun

import { spawn } from "child_process";
import * as rpc from "vscode-jsonrpc/node";
import { resolve, join } from "path";
import { mkdirSync, writeFileSync, rmSync } from "fs";

const TEST_DIR = join(import.meta.dir, "metals-debug");

// Clean and create test directory
try { rmSync(TEST_DIR, { recursive: true, force: true }); } catch {}
mkdirSync(TEST_DIR, { recursive: true });

// Create a minimal build.sbt
const buildSbt = `
scalaVersion := "3.3.0"

lazy val root = project
  .in(file("."))
  .settings(
    name := "test-project"
  )
`;
writeFileSync(join(TEST_DIR, "build.sbt"), buildSbt);

// Create test Scala file
const scalaFile = join(TEST_DIR, "Test.scala");
const scalaContent = `object Test {
  def main(args: Array[String]): Unit = {
    val x: String = 123  // Type error
    println(undefinedVar)  // Undefined variable
  }
}`;
writeFileSync(scalaFile, scalaContent);

console.log("Starting Metals with root path:", TEST_DIR);

const serverProcess = spawn("/Users/steven_chong/Library/Application Support/Coursier/bin/metals", [], {
  cwd: TEST_DIR,
  env: { ...process.env }
});

serverProcess.stderr?.on('data', (data) => {
  console.error("STDERR:", data.toString());
});

const connection = rpc.createMessageConnection(
  new rpc.StreamMessageReader(serverProcess.stdout!),
  new rpc.StreamMessageWriter(serverProcess.stdin!)
);

// Track all notifications and requests
connection.onNotification((method: string, params: any) => {
  console.log(`📩 Notification: ${method}`);
  if (method === "textDocument/publishDiagnostics") {
    console.log("🎯 DIAGNOSTICS:", JSON.stringify(params, null, 2));
  }
  if (method === "window/logMessage") {
    console.log(`   Log: ${params.message}`);
  }
});

connection.onRequest((method: string, params: any) => {
  console.log(`📨 Request: ${method}`);
  
  if (method === "window/showMessageRequest") {
    console.log(`   Message: ${params.message}`);
    if (params.actions && params.actions.length > 0) {
      console.log(`   Auto-selecting: ${params.actions[0].title}`);
      return params.actions[0];
    }
    return null;
  }
  
  if (method === "workspace/configuration") {
    console.log("   Returning empty configuration");
    return params.items.map(() => ({}));
  }
  
  if (method === "client/registerCapability") {
    console.log("   Registering capability");
    return null;
  }
  
  return null;
});

connection.listen();

// Send initialize
const initParams = {
  processId: process.pid,
  rootUri: `file://${TEST_DIR}`,
  rootPath: TEST_DIR,
  capabilities: {
    textDocument: {
      synchronization: {
        didOpen: true,
        didChange: true,
        willSave: false,
        willSaveWaitUntil: false,
        didSave: true
      },
      completion: {
        completionItem: {
          snippetSupport: true
        }
      },
      hover: {},
      signatureHelp: {},
      references: {},
      documentHighlight: {},
      documentSymbol: {},
      formatting: {},
      rangeFormatting: {},
      definition: {},
      codeAction: {
        codeActionLiteralSupport: {
          codeActionKind: {
            valueSet: ["quickfix", "refactor", "source.organizeImports"]
          }
        }
      },
      publishDiagnostics: {
        relatedInformation: true,
        tagSupport: {
          valueSet: [1, 2]
        }
      }
    },
    workspace: {
      applyEdit: true,
      workspaceFolders: true,
      configuration: true,
      didChangeWatchedFiles: {
        dynamicRegistration: true
      },
      symbol: {}
    },
    window: {
      showMessage: {},
      showMessageRequest: {},
      showDocument: {
        support: true
      }
    }
  },
  initializationOptions: {
    decorationProvider: true,
    inlineDecorationProvider: true,
    didFocusProvider: true,
    inputBoxProvider: true,
    quickPickProvider: true,
    debuggingProvider: true,
    treeViewProvider: true,
    isHttpEnabled: true,
    commandInlayHints: true,
    statusBarProvider: "on"
  },
  workspaceFolders: [{
    uri: `file://${TEST_DIR}`,
    name: "test-project"
  }]
};

console.log("Sending initialize request...");
connection.sendRequest("initialize", initParams).then(async (result: any) => {
  console.log("✅ Initialize successful");
  console.log("Server capabilities:", Object.keys(result.capabilities));
  
  // Send initialized
  await connection.sendNotification("initialized", {});
  console.log("✅ Sent initialized notification");
  
  // Wait for build import to complete
  console.log("⏳ Waiting for build import...");
  await new Promise(resolve => setTimeout(resolve, 10000));
  
  // Open the Scala file
  console.log("📄 Opening Test.scala");
  const textDocument = {
    uri: `file://${scalaFile}`,
    languageId: "scala",
    version: 1,
    text: scalaContent
  };
  
  await connection.sendNotification("textDocument/didOpen", { textDocument });
  console.log("✅ Sent didOpen");
  
  // Wait for diagnostics
  console.log("⏳ Waiting for diagnostics...");
  
  // Keep alive for 30 seconds
  setTimeout(() => {
    console.log("Shutting down...");
    connection.sendRequest("shutdown").then(() => {
      connection.sendNotification("exit");
      process.exit(0);
    });
  }, 30000);
}).catch((error: any) => {
  console.error("Initialize error:", error);
  process.exit(1);
});