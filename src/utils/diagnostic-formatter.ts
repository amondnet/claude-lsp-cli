interface DiagnosticItem {
  file: string;
  line: number;
  column?: number;
  message: string;
  severity: "error" | "warning" | "info" | "hint";
  source?: string;
  ruleId?: string;
}

/**
 * Format diagnostic output to prevent context flooding by limiting to first 5 items
 * with a summary for any remaining items.
 */
export function formatDiagnosticsOutput(diagnostics: DiagnosticItem[]): string {
  if (diagnostics.length === 0) {
    return "";
  }

  const maxDisplayed = 5;
  const displayedDiagnostics = diagnostics.slice(0, maxDisplayed);
  const remainingCount = diagnostics.length - maxDisplayed;

  let output = "";
  
  // Format the first 5 diagnostics in detail
  for (const diagnostic of displayedDiagnostics) {
    const location = diagnostic.column 
      ? `${diagnostic.file}:${diagnostic.line}:${diagnostic.column}`
      : `${diagnostic.file}:${diagnostic.line}`;
    
    const source = diagnostic.source ? ` (${diagnostic.source})` : "";
    const ruleId = diagnostic.ruleId ? ` [${diagnostic.ruleId}]` : "";
    
    output += `${location}: ${diagnostic.severity}: ${diagnostic.message}${source}${ruleId}\n`;
  }

  // Add summary line for remaining diagnostics
  if (remainingCount > 0) {
    const errorCount = diagnostics.slice(maxDisplayed).filter(d => d.severity === "error").length;
    const warningCount = diagnostics.slice(maxDisplayed).filter(d => d.severity === "warning").length;
    
    let summary = `... and ${remainingCount} more diagnostic`;
    if (remainingCount > 1) summary += "s";
    
    if (errorCount > 0 && warningCount > 0) {
      summary += ` (${errorCount} error${errorCount > 1 ? "s" : ""}, ${warningCount} warning${warningCount > 1 ? "s" : ""})`;
    } else if (errorCount > 0) {
      summary += ` (${errorCount} error${errorCount > 1 ? "s" : ""})`;
    } else if (warningCount > 0) {
      summary += ` (${warningCount} warning${warningCount > 1 ? "s" : ""})`;
    }
    
    output += summary + "\n";
  }

  return output.trim();
}