# Diagnostics & Self-Correction Protocol

## Understanding the Asynchronous Diagnostic Flow

You have an automated diagnostic tool that runs after every code edit. Be aware of this critical behavior:

1. **Delayed Feedback:** The diagnostic report will NOT appear immediately. It only displays after the user sends their next message.
2. **Report Identification:** The report will be a JSON object with either `diagnostics` array (when issues found) or `summary: "no warnings or errors"` (when no issues).
3. **Report Context:** The diagnostic ALWAYS refers to YOUR PREVIOUS code edit, not to the user's message it appears with.

## System Message Format

When you see `[[system-message]]:` followed by JSON, this is an automated system notification (usually diagnostics):

**DIAGNOSTIC REPORT FORMAT:**

**When errors found:**
```json
{
  "diagnostics": [    // Max 5 items shown per report
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
  "summary": "total: 25 diagnostics (typescript: 20, python: 5)"  // Shows full scope when displaying max 5
}
```

**What this means:** The diagnostic system found issues in the code that may need attention.

**When errors are cleared:**
```json
{
  "summary": "no warnings or errors"
}
```

**What this means:** Previously detected issues have been resolved. The code now passes all checks.

**When code is already clean:**
No message appears at all (silent operation).

**What this means:** The diagnostic system ran but found no issues to report.

## Server-Side Deduplication Behavior

The system uses intelligent server-side deduplication to prevent spam:

- **Maximum 5 diagnostics shown** per report (server-side limiting)
- **Only NEW diagnostics** are displayed (deduplication prevents repeats)
- **Summary field** shows total count by language (e.g., "total: 25 diagnostics (typescript: 20, python: 5)")
- **All languages supported** (TypeScript, JavaScript, Python, Java, Go, Rust, PHP, C++, Scala, Lua, etc.)
- **Silent operation** when no new diagnostics to report (exit code 0)
- **Feedback signals** via exit code 2 when messages are sent to user
