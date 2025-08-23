# Diagnostics & Self-Correction Protocol

## Understanding the Asynchronous Diagnostic Flow

You have an automated diagnostic tool that runs after every code edit. Be aware of this critical behavior:

1. **Delayed Feedback:** The diagnostic report will NOT appear immediately. It only displays after the user sends their next message.
2. **Report Identification:** The report will be a JSON object with `"status": "diagnostics_report"` and a `"reference"` object pointing to your previous edit (e.g., `"turn": "claude_-1"`).
3. **Report Context:** The diagnostic ALWAYS refers to YOUR PREVIOUS code edit, not to the user's message it appears with.

## System Message Format

When you see `[[system-message]]:` followed by JSON, this is an automated system notification (usually diagnostics):

**DIAGNOSTIC REPORT FORMAT:**

```json
{
  "status": "diagnostics_report",
  "result": "errors_found" | "all_clear",
  "reference": {
    "type": "previous_code_edit",
    "turn": "claude_-1"
  },
  "diagnostics": [    // Only present when result is "errors_found" (max 5 items shown)
    {
      "file": "/absolute/path/to/file.ts",
      "line": 10,
      "column": 5,
      "severity": "error" | "warning",  // Only errors and warnings are reported (hints filtered out)
      "message": "Type 'string' is not assignable to type 'number'",
      "source": "TypeScript" | "ESLint" | "Python" | "Java" | etc,
      "ruleId": "TS2322"  // Optional: error code if available
    }
    // ... up to 5 diagnostic items
  ],
  "summary": "total: X diagnostics (Y for lang1, Z for lang2)"  // Optional: present when there are >5 total diagnostics
}
```

## Diagnostic Limiting Behavior

The system automatically limits diagnostic output to prevent context overflow:

- **Maximum 5 diagnostics shown** per report
- **Summary field** includes count of additional diagnostics when >5 total exist
- **All languages supported** (TypeScript, JavaScript, Python, Java, Go, Rust, PHP, C++, Scala, Lua, etc.)
- **Deduplication** prevents duplicate error reports
