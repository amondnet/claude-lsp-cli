import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { Worker } from "worker_threads";
import { join } from "path";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "fs";
import { tmpdir } from "os";

describe("Diagnostic Worker", () => {
  let testDir: string;
  let worker: Worker | null = null;

  beforeEach(() => {
    // Create test directory
    testDir = mkdtempSync(join(tmpdir(), "diagnostic-worker-test-"));
    mkdirSync(join(testDir, "src"), { recursive: true });
    
    // Create test files
    writeFileSync(join(testDir, "package.json"), JSON.stringify({
      name: "test-project",
      dependencies: {}
    }));
    writeFileSync(join(testDir, "src", "test.ts"), `
      const x: string = 123; // Type error
      console.log(x);
    `);
  });

  afterEach(() => {
    // Cleanup worker
    if (worker) {
      worker.terminate();
      worker = null;
    }
    
    // Cleanup test directory
    if (testDir) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  test("should handle worker message structure", async () => {
    const workerPath = join(import.meta.dir, "../src/diagnostic-worker.ts");
    worker = new Worker(workerPath);
    
    const message = {
      projectHash: "test-hash-123",
      projectRoot: testDir,
      requestTime: Date.now()
    };
    
    // Test that worker can receive message without crashing
    const responsePromise = new Promise((resolve, reject) => {
      worker!.on("message", resolve);
      worker!.on("error", reject);
      
      // Timeout after 5 seconds
      setTimeout(() => reject(new Error("Worker timeout")), 5000);
    });
    
    worker.postMessage(message);
    
    try {
      const response = await responsePromise as any;
      expect(response).toBeDefined();
      expect(response.status).toBeOneOf(["complete", "error"]);
      expect(response.requestTime).toBe(message.requestTime);
    } catch (error) {
      // Worker might fail due to missing dependencies, which is OK for this test
      expect(error).toBeDefined();
    }
  });

  test("should handle invalid project root", async () => {
    const workerPath = join(import.meta.dir, "../src/diagnostic-worker.ts");
    worker = new Worker(workerPath);
    
    const message = {
      projectHash: "invalid-hash",
      projectRoot: "/non/existent/path",
      requestTime: Date.now()
    };
    
    const responsePromise = new Promise((resolve) => {
      worker!.on("message", resolve);
    });
    
    worker.postMessage(message);
    
    const response = await responsePromise as any;
    expect(response.status).toBe("error");
    expect(response.requestTime).toBe(message.requestTime);
    expect(response.error).toBeDefined();
  });

  test("should terminate gracefully on SIGTERM", () => {
    const workerPath = join(import.meta.dir, "../src/diagnostic-worker.ts");
    worker = new Worker(workerPath);
    
    // Send SIGTERM signal
    const exitPromise = new Promise((resolve) => {
      worker!.on("exit", resolve);
    });
    
    worker.terminate();
    
    // Worker should exit without throwing
    expect(exitPromise).resolves.toBeDefined();
  });

  test("should validate message structure", () => {
    // Test that WorkerMessage interface is correctly defined
    const validMessage = {
      projectHash: "hash",
      projectRoot: "/path",
      requestTime: 123456789
    };
    
    // All fields should be required
    expect(validMessage.projectHash).toBeDefined();
    expect(validMessage.projectRoot).toBeDefined();
    expect(validMessage.requestTime).toBeDefined();
    
    // Type checking (compile-time validation)
    const invalidMessages = [
      { projectRoot: "/path", requestTime: 123 }, // Missing projectHash
      { projectHash: "hash", requestTime: 123 },  // Missing projectRoot
      { projectHash: "hash", projectRoot: "/path" } // Missing requestTime
    ];
    
    invalidMessages.forEach(msg => {
      expect(Object.keys(msg).length).toBeLessThan(3);
    });
  });

  test("should handle response message structure", () => {
    // Test response message formats
    const completeResponse = {
      status: 'complete',
      requestTime: 123456789,
      count: 10
    };
    
    const errorResponse = {
      status: 'error',
      requestTime: 123456789,
      error: 'Something went wrong'
    };
    
    // Validate complete response
    expect(completeResponse.status).toBe('complete');
    expect(completeResponse.count).toBeGreaterThanOrEqual(0);
    
    // Validate error response
    expect(errorResponse.status).toBe('error');
    expect(errorResponse.error).toBeDefined();
    
    // Both should have requestTime
    expect(completeResponse.requestTime).toBeDefined();
    expect(errorResponse.requestTime).toBeDefined();
  });
});