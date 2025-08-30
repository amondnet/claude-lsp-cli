import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { ServerRegistry } from "../src/utils/server-registry";
import { spawn } from "child_process";

describe("ServerRegistry", () => {
  let registry: ServerRegistry;

  beforeEach(() => {
    // Get a fresh registry instance
    registry = ServerRegistry.getInstance();
  });

  afterEach(() => {
    // Clean up
    registry.close();
  });

  describe("Server Registration", () => {
    test("should register a new server", () => {
      const projectRoot = "/test/project";
      const languages = ["typescript"];
      const pid = 12345;
      const socketPath = "/tmp/test.sock";

      const hash = registry.registerServer(projectRoot, languages, pid, socketPath);
      
      expect(hash).toBeTruthy();
      expect(hash.length).toBe(16); // Hash should be 16 chars
      
      const server = registry.getServer(hash);
      expect(server).toBeTruthy();
      expect(server?.project_root).toBe(projectRoot);
      expect(server?.pid).toBe(pid);
      expect(server?.languages).toEqual(languages);
    });

    test("should get server by project path", () => {
      const projectRoot = "/test/project2";
      const languages = ["python"];
      const pid = 54321;
      const socketPath = "/tmp/test2.sock";

      registry.registerServer(projectRoot, languages, pid, socketPath);
      
      const server = registry.getServerByPath(projectRoot);
      expect(server).toBeTruthy();
      expect(server?.project_root).toBe(projectRoot);
      expect(server?.pid).toBe(pid);
    });
  });

  describe("Server Status Management", () => {
    test("should update server status", () => {
      const projectRoot = "/test/project3";
      const hash = registry.registerServer(projectRoot, [], 99999, "/tmp/test3.sock");
      
      registry.updateServerStatus(hash, "healthy");
      
      const server = registry.getServer(hash);
      expect(server?.status).toBe("healthy");
    });

    test("should update heartbeat", () => {
      const projectRoot = "/test/project4";
      const hash = registry.registerServer(projectRoot, [], 88888, "/tmp/test4.sock");
      
      const beforeHeartbeat = registry.getServer(hash)?.last_response;
      
      // Wait a bit to ensure time difference
      setTimeout(() => {
        registry.updateHeartbeat(hash);
        const afterHeartbeat = registry.getServer(hash)?.last_response;
        expect(afterHeartbeat).not.toBe(beforeHeartbeat);
      }, 10);
    });

    test("should mark server as stopped", () => {
      const projectRoot = "/test/project5";
      const hash = registry.registerServer(projectRoot, [], 77777, "/tmp/test5.sock");
      
      registry.markServerStopped(hash);
      
      const server = registry.getServer(hash);
      expect(server?.status).toBe("stopped");
    });
  });

  describe("Server Listing", () => {
    test("should get all active servers", () => {
      // Register multiple servers
      registry.registerServer("/test/active1", ["typescript"], 11111, "/tmp/a1.sock");
      registry.registerServer("/test/active2", ["python"], 22222, "/tmp/a2.sock");
      const hash3 = registry.registerServer("/test/stopped1", ["rust"], 33333, "/tmp/s1.sock");
      
      // Mark one as stopped
      registry.markServerStopped(hash3);
      
      const activeServers = registry.getAllActiveServers();
      
      // Should only return non-stopped servers
      const activePaths = activeServers.map(s => s.project_root);
      expect(activePaths).toContain("/test/active1");
      expect(activePaths).toContain("/test/active2");
      expect(activePaths).not.toContain("/test/stopped1");
    });

    test("should get statistics", () => {
      // Register servers with different languages
      registry.registerServer("/test/stats1", ["typescript", "javascript"], 44444, "/tmp/st1.sock");
      registry.registerServer("/test/stats2", ["python"], 55555, "/tmp/st2.sock");
      registry.registerServer("/test/stats3", ["typescript"], 66666, "/tmp/st3.sock");
      
      const stats = registry.getStatistics();
      
      expect(stats.activeServers).toBeGreaterThanOrEqual(3);
      expect(stats.languages["typescript"]).toBeGreaterThanOrEqual(2);
      expect(stats.languages["python"]).toBeGreaterThanOrEqual(1);
      expect(stats.languages["javascript"]).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Server Limit Enforcement", () => {
    test("should enforce server limit", async () => {
      // Create dummy processes to test killing
      const processes: any[] = [];
      
      // Register many servers (more than limit)
      for (let i = 0; i < 12; i++) {
        // Spawn a simple sleep process as dummy
        const proc = spawn("sleep", ["300"]);
        processes.push(proc);
        
        if (proc.pid) {
          registry.registerServer(`/test/limit${i}`, ["typescript"], proc.pid, `/tmp/limit${i}.sock`);
        }
      }
      
      // Enforce limit of 8
      const killedCount = await registry.enforceServerLimit(8);
      
      // Should kill at least 4 servers (could be more if other tests left servers)
      expect(killedCount).toBeGreaterThanOrEqual(4);
      
      // Clean up remaining processes
      processes.forEach(p => {
        try { p.kill(); } catch {}
      });
    }, 10000);
  });

  describe("Dead Server Cleanup", () => {
    test("should clean up dead servers", async () => {
      // Register a server with non-existent PID
      const hash = registry.registerServer("/test/dead1", ["typescript"], 99999999, "/tmp/dead1.sock");
      
      // Update status to make it "active"
      registry.updateServerStatus(hash, "healthy");
      
      // Clean up dead servers
      const cleanedCount = await registry.cleanupDeadServers();
      
      expect(cleanedCount).toBeGreaterThanOrEqual(1);
      
      // Server should now be marked as stopped
      const server = registry.getServer(hash);
      expect(server?.status).toBe("stopped");
    });
  });
});