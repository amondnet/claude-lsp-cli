#!/usr/bin/env bun

import { findProjectRoot } from "./src/manager.ts";

// Test 1: Find .git from deeply nested file
const test1 = findProjectRoot("/tmp/test-git-project/src/deep/nested/file.ts");
console.log("Test 1 - Find .git from nested file:");
console.log(JSON.stringify(test1, null, 2));

// Test 2: Current working directory project
const test2 = findProjectRoot("/Users/steven_chong/Downloads/repos/kepler_app_testhooks/ui/src/app/(protected)/analytics/page.tsx");
console.log("\nTest 2 - Find project from UI nested file:");
console.log(JSON.stringify(test2, null, 2));

// Test 3: Check project isolation (different projects get different hashes)
const test3a = findProjectRoot("/tmp/test-git-project/file.ts");
const test3b = findProjectRoot("/Users/steven_chong/Downloads/repos/kepler_app_testhooks/file.ts");
console.log("\nTest 3 - Project isolation:");
console.log("Project A hash:", test3a?.hash);
console.log("Project B hash:", test3b?.hash);
console.log("Different hashes?", test3a?.hash !== test3b?.hash);