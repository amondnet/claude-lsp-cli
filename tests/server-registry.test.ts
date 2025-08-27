import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { ServerRegistry } from "../src/utils/server-registry";
import { existsSync, rmSync } from "fs";
import { join } from "path";

describe("ServerRegistry", () => {
  let registry: ServerRegistry;
  const testDbPath = join(process.env.HOME!, ".claude-lsp", "server-registry.db");
  
  beforeEach(() => {
    // Clean up any existing test database
    if (existsSync(testDbPath)) {
      rmSync(testDbPath);
    }
    registry = ServerRegistry.getInstance();
  });
  
  afterEach(() => {
    // Close and clean up
    registry.close();
  });
  
  test("registers a new server", () => {
    const projectRoot = "/test/project";
    const languages = ["typescript", "javascript"];
    const pid = 12345;
    const socketPath = "/tmp/test.sock";
    
    const hash = registry.registerServer(projectRoot, languages, pid, socketPath);
    
    expect(hash).toBeDefined();
    expect(hash.length).toBe(16);
    
    // Check that server can be retrieved
    const server = registry.getServer(hash);
    expect(server).toBeDefined();
    expect(server?.project_root).toBe(projectRoot);
    expect(server?.languages).toEqual(languages);
    expect(server?.pid).toBe(pid);
    expect(server?.socket_path).toBe(socketPath);
    expect(server?.status).toBe("starting");
  });
  
  test("retrieves server by project path", () => {
    const projectRoot = "/test/project";
    const languages = ["python"];
    const pid = 54321;
    const socketPath = "/tmp/test2.sock";
    
    registry.registerServer(projectRoot, languages, pid, socketPath);
    
    const server = registry.getServerByPath(projectRoot);
    expect(server).toBeDefined();
    expect(server?.project_root).toBe(projectRoot);
    expect(server?.languages).toEqual(languages);
  });
  
  test("updates server status", () => {
    const projectRoot = "/test/project";
    const hash = registry.registerServer(projectRoot, ["rust"], 99999, "/tmp/test3.sock");
    
    // Update status
    registry.updateServerStatus(hash, "healthy");
    
    const server = registry.getServer(hash);
    expect(server?.status).toBe("healthy");
  });
  
  test("updates heartbeat", () => {
    const projectRoot = "/test/project";
    const hash = registry.registerServer(projectRoot, ["go"], 88888, "/tmp/test4.sock");
    
    const server1 = registry.getServer(hash);
    const firstResponse = server1?.last_response;
    
    // Wait a bit and update heartbeat
    setTimeout(() => {
      registry.updateHeartbeat(hash);
      
      const server2 = registry.getServer(hash);
      expect(server2?.last_response).not.toBe(firstResponse);
      expect(server2?.status).toBe("healthy");
    }, 10);
  });
  
  test("marks server as stopped", () => {
    const projectRoot = "/test/project";
    const hash = registry.registerServer(projectRoot, ["java"], 77777, "/tmp/test5.sock");
    
    registry.markServerStopped(hash);
    
    const server = registry.getServer(hash);
    expect(server?.status).toBe("stopped");
  });
  
  test("gets all active servers", () => {
    // Register multiple servers
    registry.registerServer("/project1", ["typescript"], 11111, "/tmp/sock1.sock");
    registry.registerServer("/project2", ["python"], 22222, "/tmp/sock2.sock");
    const hash3 = registry.registerServer("/project3", ["rust"], 33333, "/tmp/sock3.sock");
    
    // Mark one as stopped
    registry.markServerStopped(hash3);
    
    const activeServers = registry.getAllActiveServers();
    expect(activeServers.length).toBe(2);
    expect(activeServers.every(s => s.status !== "stopped")).toBe(true);
  });
  
  test("cleans up dead servers", async () => {
    // Register a server with a non-existent PID
    const hash = registry.registerServer("/dead/project", ["cpp"], 999999999, "/tmp/dead.sock");
    
    // Mark it as healthy first
    registry.updateServerStatus(hash, "healthy");
    
    // Clean up dead servers
    const cleaned = await registry.cleanupDeadServers();
    expect(cleaned).toBeGreaterThanOrEqual(1);
    
    // Server should now be stopped
    const server = registry.getServer(hash);
    expect(server?.status).toBe("stopped");
  });
  
  test("gets statistics", () => {
    // Register servers with different languages
    registry.registerServer("/project1", ["typescript", "javascript"], 11111, "/tmp/sock1.sock");
    registry.registerServer("/project2", ["python"], 22222, "/tmp/sock2.sock");
    registry.registerServer("/project3", ["typescript"], 33333, "/tmp/sock3.sock");
    
    const stats = registry.getStatistics();
    
    expect(stats.activeServers).toBe(3);
    expect(stats.languages["typescript"]).toBe(2);
    expect(stats.languages["javascript"]).toBe(1);
    expect(stats.languages["python"]).toBe(1);
  });
  
  test("handles duplicate registrations", () => {
    const projectRoot = "/test/project";
    
    // Register first time
    const hash1 = registry.registerServer(projectRoot, ["ruby"], 44444, "/tmp/test6.sock");
    
    // Register again with different PID (simulating restart)
    const hash2 = registry.registerServer(projectRoot, ["ruby", "javascript"], 55555, "/tmp/test7.sock");
    
    // Should be the same hash (same project)
    expect(hash1).toBe(hash2);
    
    // Should have updated info
    const server = registry.getServer(hash1);
    expect(server?.pid).toBe(55555);
    expect(server?.languages).toEqual(["ruby", "javascript"]);
    expect(server?.socket_path).toBe("/tmp/test7.sock");
  });
});