import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { performance } from "perf_hooks";
import { checkFile } from "../src/file-checker";
import { writeFileSync, mkdirSync, rmSync, statSync } from "fs";
import { join } from "path";

/**
 * Performance regression tests for claude-lsp-cli
 * 
 * These tests establish baseline performance metrics and catch regressions.
 * They use small test files to ensure fast execution in CI.
 */

const PERFORMANCE_TEST_DIR = "/tmp/claude-lsp-performance-tests";
const PERFORMANCE_THRESHOLD_MS = 5000; // Max 5 seconds per check
const MEMORY_THRESHOLD_MB = 100; // Max 100MB memory increase

interface PerformanceMetrics {
  executionTimeMs: number;
  memoryDeltaMB: number;
  diagnosticCount: number;
  fileSizeBytes: number;
}

class PerformanceTester {
  private setupTestDir(): void {
    try {
      rmSync(PERFORMANCE_TEST_DIR, { recursive: true, force: true });
    } catch {
      // Directory might not exist
    }
    mkdirSync(PERFORMANCE_TEST_DIR, { recursive: true });
  }

  private async measurePerformance(filePath: string): Promise<PerformanceMetrics> {
    const fileSizeBytes = statSync(filePath).size;
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }

    const memBefore = process.memoryUsage();
    const startTime = performance.now();
    
    const result = await checkFile(filePath);
    
    const endTime = performance.now();
    const memAfter = process.memoryUsage();

    return {
      executionTimeMs: endTime - startTime,
      memoryDeltaMB: (memAfter.heapUsed - memBefore.heapUsed) / 1024 / 1024,
      diagnosticCount: (result && result.diagnostics) ? result.diagnostics.length : 0,
      fileSizeBytes,
    };
  }

  async testTypeScriptPerformance(): Promise<PerformanceMetrics> {
    const filePath = join(PERFORMANCE_TEST_DIR, "test.ts");
    
    // Create a moderately complex TypeScript file with intentional errors
    const content = `
interface UserData {
  id: number;
  name: string;
  email: string;
  roles: string[];
}

class UserManager {
  private users: Map<number, UserData> = new Map();
  
  addUser(userData: UserData): boolean {
    if (this.users.has(userData.id)) {
      return false;
    }
    
    // Validate email format
    const emailRegex = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
    if (!emailRegex.test(userData.email)) {
      throw new Error("Invalid email format");
    }
    
    this.users.set(userData.id, userData);
    return true;
  }
  
  getUserById(id: number): UserData | undefined {
    return this.users.get(id);
  }
  
  updateUser(id: number, updates: Partial<UserData>): boolean {
    const user = this.users.get(id);
    if (!user) {
      return false;
    }
    
    const updatedUser = { ...user, ...updates };
    this.users.set(id, updatedUser);
    return true;
  }
  
  deleteUser(id: number): boolean {
    return this.users.delete(id);
  }
  
  getAllUsers(): UserData[] {
    return Array.from(this.users.values());
  }
  
  getUsersByRole(role: string): UserData[] {
    return this.getAllUsers().filter(user => user.roles.includes(role));
  }
}

// Intentional type errors for diagnostic testing
const invalidUser: UserData = {
  id: "not-a-number", // Type error
  name: 123, // Type error
  email: "test@example.com",
  roles: ["user"]
};

const manager = new UserManager();
manager.addUser(invalidUser);

// Accessing non-existent property
console.log(manager.nonExistentMethod());

// Using undefined variable
console.log(undefinedVariable);

export { UserManager, UserData };
`;

    writeFileSync(filePath, content);
    return this.measurePerformance(filePath);
  }

  async testPythonPerformance(): Promise<PerformanceMetrics> {
    const filePath = join(PERFORMANCE_TEST_DIR, "test.py");
    
    const content = `
from typing import List, Dict, Optional, Union
import re
from dataclasses import dataclass

@dataclass
class UserData:
    id: int
    name: str
    email: str
    roles: List[str]

class UserManager:
    def __init__(self):
        self.users: Dict[int, UserData] = {}
    
    def add_user(self, user_data: UserData) -> bool:
        if user_data.id in self.users:
            return False
        
        # Validate email format
        email_pattern = r'^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$'
        if not re.match(email_pattern, user_data.email):
            raise ValueError("Invalid email format")
        
        self.users[user_data.id] = user_data
        return True
    
    def get_user_by_id(self, user_id: int) -> Optional[UserData]:
        return self.users.get(user_id)
    
    def update_user(self, user_id: int, **updates) -> bool:
        if user_id not in self.users:
            return False
        
        user = self.users[user_id]
        for key, value in updates.items():
            if hasattr(user, key):
                setattr(user, key, value)
        
        return True
    
    def delete_user(self, user_id: int) -> bool:
        return self.users.pop(user_id, None) is not None
    
    def get_all_users(self) -> List[UserData]:
        return list(self.users.values())
    
    def get_users_by_role(self, role: str) -> List[UserData]:
        return [user for user in self.get_all_users() if role in user.roles]

# Intentional type errors for diagnostic testing
invalid_user: UserData = UserData(
    id="not-a-number",  # Type error
    name=123,  # Type error
    email="test@example.com",
    roles=["user"]
)

manager = UserManager()
manager.add_user(invalid_user)

# Using undefined variable
print(undefined_variable)

# Calling non-existent method
manager.non_existent_method()
`;

    writeFileSync(filePath, content);
    return this.measurePerformance(filePath);
  }

  async testJavaScriptPerformance(): Promise<PerformanceMetrics> {
    const filePath = join(PERFORMANCE_TEST_DIR, "test.js");
    
    const content = `
class UserManager {
  constructor() {
    this.users = new Map();
  }
  
  addUser(userData) {
    if (this.users.has(userData.id)) {
      return false;
    }
    
    // Validate email format
    const emailRegex = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
    if (!emailRegex.test(userData.email)) {
      throw new Error("Invalid email format");
    }
    
    this.users.set(userData.id, userData);
    return true;
  }
  
  getUserById(id) {
    return this.users.get(id);
  }
  
  updateUser(id, updates) {
    const user = this.users.get(id);
    if (!user) {
      return false;
    }
    
    const updatedUser = { ...user, ...updates };
    this.users.set(id, updatedUser);
    return true;
  }
  
  deleteUser(id) {
    return this.users.delete(id);
  }
  
  getAllUsers() {
    return Array.from(this.users.values());
  }
  
  getUsersByRole(role) {
    return this.getAllUsers().filter(user => user.roles.includes(role));
  }
}

// Potential linting issues
var unusedVariable = "test";
const manager = new UserManager();

// Using undefined variable
console.log(undefinedVariable);

// Calling non-existent method
manager.nonExistentMethod();

module.exports = { UserManager };
`;

    writeFileSync(filePath, content);
    return this.measurePerformance(filePath);
  }

  cleanup(): void {
    try {
      rmSync(PERFORMANCE_TEST_DIR, { recursive: true, force: true });
    } catch {
      // Directory might not exist or be in use
    }
  }
}

describe("Performance Tests", () => {
  const tester = new PerformanceTester();
  
  beforeEach(() => {
    tester.setupTestDir();
  });
  
  afterEach(() => {
    tester.cleanup();
  });

  it("TypeScript file checking should complete within performance threshold", async () => {
    const metrics = await tester.testTypeScriptPerformance();
    
    expect(metrics.executionTimeMs).toBeLessThan(PERFORMANCE_THRESHOLD_MS);
    expect(metrics.memoryDeltaMB).toBeLessThan(MEMORY_THRESHOLD_MB);
    
    // Should detect the intentional type errors
    expect(metrics.diagnosticCount).toBeGreaterThan(0);
    
    console.log(`TypeScript performance: ${metrics.executionTimeMs.toFixed(2)}ms, ${metrics.memoryDeltaMB.toFixed(2)}MB, ${metrics.diagnosticCount} diagnostics`);
  }, 10000); // 10 second timeout

  it("Python file checking should complete within performance threshold", async () => {
    const metrics = await tester.testPythonPerformance();
    
    expect(metrics.executionTimeMs).toBeLessThan(PERFORMANCE_THRESHOLD_MS);
    expect(metrics.memoryDeltaMB).toBeLessThan(MEMORY_THRESHOLD_MB);
    
    // Python might not have diagnostics if pyright is not available
    console.log(`Python performance: ${metrics.executionTimeMs.toFixed(2)}ms, ${metrics.memoryDeltaMB.toFixed(2)}MB, ${metrics.diagnosticCount} diagnostics`);
  }, 10000);

  it("JavaScript file checking should complete within performance threshold", async () => {
    const metrics = await tester.testJavaScriptPerformance();
    
    expect(metrics.executionTimeMs).toBeLessThan(PERFORMANCE_THRESHOLD_MS);
    expect(metrics.memoryDeltaMB).toBeLessThan(MEMORY_THRESHOLD_MB);
    
    console.log(`JavaScript performance: ${metrics.executionTimeMs.toFixed(2)}ms, ${metrics.memoryDeltaMB.toFixed(2)}MB, ${metrics.diagnosticCount} diagnostics`);
  }, 10000);

  it("should maintain consistent performance across multiple runs", async () => {
    const runs = 3;
    const metrics: PerformanceMetrics[] = [];
    
    // Run TypeScript test multiple times
    for (let i = 0; i < runs; i++) {
      const result = await tester.testTypeScriptPerformance();
      metrics.push(result);
    }
    
    // Calculate variance
    const times = metrics.map(m => m.executionTimeMs);
    const avgTime = times.reduce((sum, t) => sum + t, 0) / times.length;
    const variance = times.reduce((sum, t) => sum + Math.pow(t - avgTime, 2), 0) / times.length;
    const standardDeviation = Math.sqrt(variance);
    
    // Standard deviation should be less than 50% of average time
    const coefficientOfVariation = standardDeviation / avgTime;
    expect(coefficientOfVariation).toBeLessThan(0.5);
    
    console.log(`Performance consistency: avg ${avgTime.toFixed(2)}ms, std dev ${standardDeviation.toFixed(2)}ms, CV ${(coefficientOfVariation * 100).toFixed(1)}%`);
  }, 30000); // 30 second timeout for multiple runs

  it("should handle memory efficiently with large diagnostic output", async () => {
    const filePath = join(PERFORMANCE_TEST_DIR, "large-diagnostics.ts");
    
    // Create a file with many errors to test memory handling
    const errors = Array.from({ length: 50 }, (_, i) => `
const error${i}: string = ${i}; // Type error
console.log(undefinedVar${i}); // Undefined variable
`).join('\n');
    
    writeFileSync(filePath, `// File with many diagnostics\n${errors}`);
    
    const metrics = await tester.measurePerformance(filePath);
    
    expect(metrics.executionTimeMs).toBeLessThan(PERFORMANCE_THRESHOLD_MS);
    expect(metrics.memoryDeltaMB).toBeLessThan(MEMORY_THRESHOLD_MB);
    expect(metrics.diagnosticCount).toBeGreaterThan(10); // Should find many errors
    
    console.log(`Large diagnostics performance: ${metrics.executionTimeMs.toFixed(2)}ms, ${metrics.memoryDeltaMB.toFixed(2)}MB, ${metrics.diagnosticCount} diagnostics`);
  }, 15000);
});

describe("Performance Benchmarking Utilities", () => {
  it("should export performance measurement functionality", () => {
    // Test that the performance testing utilities can be imported
    const tester = new PerformanceTester();
    expect(tester).toBeDefined();
    expect(typeof tester.testTypeScriptPerformance).toBe('function');
    expect(typeof tester.testPythonPerformance).toBe('function');
    expect(typeof tester.testJavaScriptPerformance).toBe('function');
  });
});