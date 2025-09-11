import { join } from "path";
import { checkFile } from "../../file-checker";
import { extractFilePaths } from "../utils/file-extraction";
import { shouldShowResult, markResultShown } from "../utils/deduplication";

export async function handlePostToolUse(input: string): Promise<void> {
  try {
    if (!input.trim()) {
      process.exit(0);
    }
    
    let hookData: any;
    try {
      hookData = JSON.parse(input);
    } catch {
      process.exit(0);
    }
    
    const filePaths = extractFilePaths(hookData);
    if (filePaths.length === 0) {
      process.exit(0);
    }
    
    // Process all files in parallel and collect results
    const absolutePaths = filePaths.map(filePath => 
      filePath.startsWith("/") 
        ? filePath 
        : join(hookData?.cwd || process.cwd(), filePath)
    );
    
    // Debug: log files being checked
    if (process.env.DEBUG === "true" || process.env.DEBUG_EXTRACTION === "true") {
      console.error("Extracted file paths:", filePaths);
      console.error("Absolute paths to check:", absolutePaths);
    }
    
    const results = await Promise.all(
      absolutePaths.map(absolutePath => checkFile(absolutePath))
    );
    
    let allDiagnostics = [];
    let hasErrors = false;
    
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const absolutePath = absolutePaths[i];
      
      // Skip if checking was disabled (result is null) or file type not supported
      if (!result) {
        continue;
      }
      
      if (result.diagnostics.length > 0) {
        const importantIssues = result.diagnostics.filter(
          d => d.severity === "error" || d.severity === "warning"
        );
        
        if (importantIssues.length > 0 && shouldShowResult(absolutePath, importantIssues.length)) {
          // Add file context to diagnostics
          const fileRelativePath = result.file || filePaths[i];
          for (const diag of importantIssues) {
            allDiagnostics.push({
              ...diag,
              file: fileRelativePath
            });
          }
          markResultShown(absolutePath, importantIssues.length);
          hasErrors = true;
        }
      }
    }
    
    // Show combined results if any errors found
    if (hasErrors && allDiagnostics.length > 0) {
      const errors = allDiagnostics.filter(d => d.severity === "error");
      const warnings = allDiagnostics.filter(d => d.severity === "warning");
      
      const summaryParts = [];
      if (errors.length > 0) summaryParts.push(`${errors.length} error(s)`);
      if (warnings.length > 0) summaryParts.push(`${warnings.length} warning(s)`);
      
      const combinedResult = {
        diagnostics: allDiagnostics.slice(0, 5), // Show at most 5 items
        summary: summaryParts.join(", ")
      };
      
      console.error(`[[system-message]]:${JSON.stringify(combinedResult)}`);
      process.exit(2);
    }
    
    process.exit(0);
    
  } catch (error) {
    console.error(`Hook processing failed: ${error}`);
    process.exit(1);
  }
}