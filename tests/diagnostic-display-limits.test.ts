import { test, expect, describe } from "bun:test";
import { formatDiagnosticsOutput } from "../src/utils/diagnostic-formatter";

describe("Diagnostic Display Limits", () => {
  test("should limit output to first 5 diagnostics with summary", () => {
    const mockDiagnostics = [
      { file: "file1.ts", line: 1, message: "Error 1", severity: "error" as const },
      { file: "file2.ts", line: 2, message: "Error 2", severity: "error" as const },
      { file: "file3.ts", line: 3, message: "Error 3", severity: "warning" as const },
      { file: "file4.ts", line: 4, message: "Error 4", severity: "error" as const },
      { file: "file5.ts", line: 5, message: "Error 5", severity: "warning" as const },
      { file: "file6.ts", line: 6, message: "Error 6", severity: "error" as const },
      { file: "file7.ts", line: 7, message: "Error 7", severity: "warning" as const },
      { file: "file8.ts", line: 8, message: "Error 8", severity: "error" as const }
    ];

    const output = formatDiagnosticsOutput(mockDiagnostics);
    
    // Should contain first 5 diagnostics
    expect(output).toContain("file1.ts");
    expect(output).toContain("file2.ts"); 
    expect(output).toContain("file3.ts");
    expect(output).toContain("file4.ts");
    expect(output).toContain("file5.ts");
    
    // Should NOT contain diagnostics 6-8 in detail
    expect(output).not.toContain("Error 6");
    expect(output).not.toContain("Error 7");
    expect(output).not.toContain("Error 8");
    
    // Should contain summary for remaining items
    expect(output).toContain("3 more");
  });

  test("should show all diagnostics if 5 or fewer", () => {
    const mockDiagnostics = [
      { file: "file1.ts", line: 1, message: "Error 1", severity: "error" as const },
      { file: "file2.ts", line: 2, message: "Error 2", severity: "warning" as const },
      { file: "file3.ts", line: 3, message: "Error 3", severity: "error" as const }
    ];

    const output = formatDiagnosticsOutput(mockDiagnostics);
    
    // Should contain all diagnostics
    expect(output).toContain("file1.ts");
    expect(output).toContain("file2.ts");
    expect(output).toContain("file3.ts");
    
    // Should NOT contain summary line
    expect(output).not.toContain("more");
  });

  test("should handle empty diagnostics array", () => {
    const output = formatDiagnosticsOutput([]);
    expect(output).toBe("");
  });
});