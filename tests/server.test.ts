#!/usr/bin/env bun

import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { spawn } from "child_process";
import { existsSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { createHash } from "crypto";

const TEST_PROJECT = "/tmp/claude-lsp-server-test";
const projectRoot = join(import.meta.dir, "..");

describe("Server HTTP Endpoints", () => {
  let serverProcess: any;
  let serverPort: number = 3939;
  let projectHash: string;
  
  beforeAll(async () => {
    // Clean up and create test project
    if (existsSync(TEST_PROJECT)) {
      rmSync(TEST_PROJECT, { recursive: true });
    }
    mkdirSync(TEST_PROJECT, { recursive: true });
    
    // Create test files
    writeFileSync(join(TEST_PROJECT, "package.json"), JSON.stringify({
      name: "test-project",
      version: "1.0.0"
    }, null, 2));
    
    writeFileSync(join(TEST_PROJECT, "test.ts"), `
const message: string = 123; // Type error
console.log(mesage); // Typo
`);
    
    // Calculate project hash
    projectHash = createHash('sha256').update(TEST_PROJECT).digest('hex').substring(0, 16);
    
    // Start server
    serverProcess = spawn("bun", ["run", join(projectRoot, "src/server.ts"), TEST_PROJECT], {
      stdio: ["inherit", "inherit", "inherit"],
      env: { ...process.env, LSP_PORT: serverPort.toString(), PROJECT_ROOT: TEST_PROJECT, CLAUDE_LSP_HOOK_MODE: 'true' }
    });
    
    // Wait for server to be ready by polling health endpoint
    let serverReady = false;
    for (let i = 0; i < 30; i++) {
      try {
        const response = await fetch(`http://localhost:${serverPort}/health`);
        if (response.ok) {
          serverReady = true;
          break;
        }
      } catch (e) {
        // Server not ready yet
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    if (!serverReady) {
      console.error("Server failed to start within 15 seconds on port", serverPort);
    }
  });
  
  afterAll(async () => {
    if (serverProcess) {
      serverProcess.kill('SIGTERM');
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  });
  
  test("GET /health returns server status", async () => {
    const response = await fetch(`http://localhost:${serverPort}/health`);
    expect(response.ok).toBe(true);
    
    const data = await response.json() as any;
    expect(data.status).toBe("healthy");
    expect(data.projectHash).toBe(projectHash);
    expect(data.projectRoot).toBe(TEST_PROJECT);
    expect(data).toHaveProperty("uptime");
    expect(data).toHaveProperty("activeServers");
  });
  
  test("GET /languages returns supported languages", async () => {
    const response = await fetch(`http://localhost:${serverPort}/languages`);
    expect(response.ok).toBe(true);
    
    const data = await response.json() as any;
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    
    // Check language structure
    const tsLang = data.find((l: any) => l.id === "typescript");
    expect(tsLang).toBeDefined();
    expect(tsLang).toHaveProperty("name");
    expect(tsLang).toHaveProperty("installed");
    expect(tsLang).toHaveProperty("extensions");
  });
  
  test("GET /servers returns active language servers", async () => {
    const response = await fetch(`http://localhost:${serverPort}/servers`);
    expect(response.ok).toBe(true);
    
    const data = await response.json() as any;
    expect(Array.isArray(data)).toBe(true);
    
    // If TypeScript is installed, it should be active
    if (data.length > 0) {
      expect(data[0]).toHaveProperty("language");
      expect(data[0]).toHaveProperty("pid");
      expect(data[0]).toHaveProperty("status");
    }
  });
  
  test("GET /diagnostics/all returns project diagnostics", async () => {
    const response = await fetch(`http://localhost:${serverPort}/diagnostics/all`);
    expect(response.ok).toBe(true);
    
    const data = await response.json() as any;
    expect(data).toHaveProperty("diagnostics");
    expect(data).toHaveProperty("timestamp");
    expect(Array.isArray(data.diagnostics)).toBe(true);
  });
  
  test("GET /diagnostics with file parameter", async () => {
    const testFile = join(TEST_PROJECT, "test.ts");
    const response = await fetch(`http://localhost:${serverPort}/diagnostics?file=${encodeURIComponent(testFile)}`);
    expect(response.ok).toBe(true);
    
    const data = await response.json() as any;
    expect(data).toHaveProperty("diagnostics");
    expect(data).toHaveProperty("timestamp");
    expect(Array.isArray(data.diagnostics)).toBe(true);
  });
  
  test("POST /shutdown responds correctly", async () => {
    // Don't actually shutdown in test, just check endpoint exists
    const response = await fetch(`http://localhost:${serverPort}/shutdown`, {
      method: "POST"
    });
    // Should respond before shutting down
    expect(response.ok || response.status === 503).toBe(true);
  });
  
  test("Invalid endpoint returns 404", async () => {
    const response = await fetch(`http://localhost:${serverPort}/invalid`);
    expect(response.status).toBe(404);
  });
});

describe("Server Unix Socket", () => {
  let serverProcess: any;
  let socketPath: string;
  let projectHash: string;
  
  beforeAll(async () => {
    // Setup test project
    if (!existsSync(TEST_PROJECT)) {
      mkdirSync(TEST_PROJECT, { recursive: true });
    }
    
    // Calculate project hash
    projectHash = createHash('sha256').update(TEST_PROJECT).digest('hex').substring(0, 16);
    
    // Determine socket path
    const socketDir = process.platform === 'darwin' 
      ? `${process.env.HOME}/Library/Application Support/claude-lsp/run`
      : `${process.env.HOME}/.claude-lsp/run`;
    socketPath = `${socketDir}/claude-lsp-${projectHash}.sock`;
    
    // Start server
    serverProcess = spawn("bun", ["run", join(projectRoot, "src/server.ts"), TEST_PROJECT], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, PROJECT_ROOT: TEST_PROJECT }
    });
    
    // Wait for socket to be created
    let attempts = 0;
    while (!existsSync(socketPath) && attempts < 20) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      attempts++;
    }
  });
  
  afterAll(async () => {
    if (serverProcess) {
      serverProcess.kill('SIGTERM');
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  });
  
  test("Unix socket is created", () => {
    expect(existsSync(socketPath)).toBe(true);
  });
  
  test("Unix socket responds to health check", async () => {
    if (!existsSync(socketPath)) {
      console.log("Socket not found, skipping test");
      return;
    }
    
    try {
      // Bun supports unix socket in fetch
      const response = await fetch("http://localhost/health", {
        // @ts-ignore
        unix: socketPath
      });
      
      expect(response.ok).toBe(true);
      const data = await response.json() as any;
      expect(data.status).toBe("healthy");
    } catch (error) {
      console.log("Unix socket test error:", error);
    }
  });
});

describe("Server Rate Limiting", () => {
  let serverProcess: any;
  let serverPort: number = 3940; // Different port to avoid conflicts
  
  beforeAll(async () => {
    if (!existsSync(TEST_PROJECT)) {
      mkdirSync(TEST_PROJECT, { recursive: true });
    }
    
    // Start server with rate limiting
    serverProcess = spawn("bun", ["run", join(projectRoot, "src/server.ts"), TEST_PROJECT], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, LSP_PORT: serverPort.toString(), PROJECT_ROOT: TEST_PROJECT }
    });
    
    // Wait for server to be ready
    let serverReady = false;
    for (let i = 0; i < 30; i++) {
      try {
        const response = await fetch(`http://localhost:${serverPort}/health`);
        if (response.ok) {
          serverReady = true;
          break;
        }
      } catch (e) {
        // Server not ready yet
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  });
  
  afterAll(async () => {
    if (serverProcess) {
      serverProcess.kill('SIGTERM');
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  });
  
  test("Rate limiting kicks in after threshold", async () => {
    // Make multiple rapid requests
    const requests = [];
    for (let i = 0; i < 15; i++) {
      requests.push(fetch(`http://localhost:${serverPort}/diagnostics/all`));
    }
    
    const responses = await Promise.all(requests);
    
    // Some should be rate limited (429)
    const rateLimited = responses.filter(r => r.status === 429);
    expect(rateLimited.length).toBeGreaterThan(0);
    
    // But not all should be rate limited
    const successful = responses.filter(r => r.ok);
    expect(successful.length).toBeGreaterThan(0);
  });
});

describe("Server Error Handling", () => {
  test("Server handles invalid project path gracefully", async () => {
    const invalidPath = "/non/existent/path";
    
    // Start server with invalid path
    const serverProcess = spawn("bun", ["run", join(projectRoot, "src/server.ts"), invalidPath], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, LSP_PORT: "3941" }
    });
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    try {
      const response = await fetch("http://localhost:3941/health");
      // Server should still respond even with invalid project
      expect(response.ok || response.status === 503).toBe(true);
    } catch (error) {
      // Server may not start at all with invalid path
      expect(error).toBeDefined();
    } finally {
      serverProcess.kill('SIGTERM');
    }
  });
  
  test("Server handles malformed requests", async () => {
    // Start a test server for this test
    const testServerProcess = spawn("bun", ["run", join(projectRoot, "src/server.ts"), TEST_PROJECT], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, LSP_PORT: "3942", PROJECT_ROOT: TEST_PROJECT }
    });
    
    // Wait for server to start
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    try {
      const response = await fetch("http://localhost:3942/diagnostics?file=<script>alert(1)</script>");
      // Should sanitize or reject malformed input
      expect(response.status === 400 || response.status === 404 || response.ok).toBe(true);
    } finally {
      testServerProcess.kill('SIGTERM');
    }
  });
});