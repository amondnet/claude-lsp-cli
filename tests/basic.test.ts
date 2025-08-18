#!/usr/bin/env bun

import { test, expect, describe } from "bun:test";
import { existsSync } from "fs";
import { join } from "path";

const projectRoot = join(import.meta.dir, "..");

describe("Basic Tests", () => {
  test("project structure exists", () => {
    expect(existsSync(join(projectRoot, "src/cli.ts"))).toBe(true);
    expect(existsSync(join(projectRoot, "src/server.ts"))).toBe(true);
    expect(existsSync(join(projectRoot, "src/lsp-client.ts"))).toBe(true);
    expect(existsSync(join(projectRoot, "src/diagnostics.ts"))).toBe(true);
  });

  test("package.json is valid", () => {
    const pkg = require(join(projectRoot, "package.json"));
    expect(pkg.name).toBe("claude-code-lsp");
    expect(pkg.version).toBe("3.0.0");
  });

  test("security utilities exist", () => {
    expect(existsSync(join(projectRoot, "src/utils/security.ts"))).toBe(true);
    expect(existsSync(join(projectRoot, "src/utils/logger.ts"))).toBe(true);
    expect(existsSync(join(projectRoot, "src/utils/rate-limiter.ts"))).toBe(true);
  });
});