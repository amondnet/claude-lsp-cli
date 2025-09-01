import { describe, test, expect } from "bun:test";
import { TIMEOUTS } from "../src/constants";

describe("Constants", () => {
  describe("TIMEOUTS", () => {
    test("should have all required timeout constants", () => {
      expect(TIMEOUTS).toBeDefined();
      expect(TIMEOUTS.DIAGNOSTIC_TIMEOUT_MS).toBeDefined();
      expect(TIMEOUTS.SERVER_REQUEST_TIMEOUT_MS).toBeDefined();
      expect(TIMEOUTS.RESET_TIMEOUT_MS).toBeDefined();
      expect(TIMEOUTS.HOOK_TIMEOUT_MS).toBeDefined();
      expect(TIMEOUTS.METALS_READY_TIMEOUT_MS).toBeDefined();
      expect(TIMEOUTS.MANAGER_TIMEOUT_MS).toBeDefined();
      expect(TIMEOUTS.RATE_LIMIT_WINDOW_MS).toBeDefined();
      expect(TIMEOUTS.CLEANUP_INTERVAL_MS).toBeDefined();
    });

    test("should have correct timeout values", () => {
      expect(TIMEOUTS.DIAGNOSTIC_TIMEOUT_MS).toBe(30000);
      expect(TIMEOUTS.SERVER_REQUEST_TIMEOUT_MS).toBe(10000);
      expect(TIMEOUTS.RESET_TIMEOUT_MS).toBe(5000);
      expect(TIMEOUTS.HOOK_TIMEOUT_MS).toBe(15000);
      expect(TIMEOUTS.METALS_READY_TIMEOUT_MS).toBe(60000);
      expect(TIMEOUTS.MANAGER_TIMEOUT_MS).toBe(5000);
      expect(TIMEOUTS.RATE_LIMIT_WINDOW_MS).toBe(60000);
      expect(TIMEOUTS.CLEANUP_INTERVAL_MS).toBe(60000);
    });

    test("should be treated as immutable in TypeScript", () => {
      // TypeScript's 'as const' provides compile-time immutability
      // At runtime, objects are still mutable in JavaScript
      // This test verifies the const assertion is properly typed
      
      const timeoutKeys = Object.keys(TIMEOUTS) as Array<keyof typeof TIMEOUTS>;
      
      // All properties should be readonly at compile time
      timeoutKeys.forEach(key => {
        expect(typeof TIMEOUTS[key]).toBe("number");
      });
      
      // The object should have the expected structure
      expect(Object.keys(TIMEOUTS).length).toBe(8);
    });

    test("timeout values should be reasonable", () => {
      // All timeouts should be positive numbers
      Object.values(TIMEOUTS).forEach(timeout => {
        expect(timeout).toBeGreaterThan(0);
        expect(typeof timeout).toBe("number");
      });

      // Diagnostic timeout should be longer than server request
      expect(TIMEOUTS.DIAGNOSTIC_TIMEOUT_MS).toBeGreaterThan(TIMEOUTS.SERVER_REQUEST_TIMEOUT_MS);
      
      // Metals timeout should be one of the longest (60 seconds)
      expect(TIMEOUTS.METALS_READY_TIMEOUT_MS).toBe(60000);
      
      // Hook timeout should be reasonable for user interaction
      expect(TIMEOUTS.HOOK_TIMEOUT_MS).toBeGreaterThanOrEqual(10000);
      expect(TIMEOUTS.HOOK_TIMEOUT_MS).toBeLessThanOrEqual(30000);
    });
  });
});