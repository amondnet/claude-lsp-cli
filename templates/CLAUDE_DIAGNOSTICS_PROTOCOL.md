# Diagnostics & Self-Correction Protocol

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
  "summary": "My previous code edit to file.ts has 3 issues that need to be fixed.",
  "diagnostics": [
    {
      "file": "path/to/file",
      "line": 10,
      "column": 5,
      "severity": "error" | "warning" | "info",
      "message": "Error description",
      "ruleId": "rule-name",
      "source": "ESLint" | "TypeScript" | "Ruff" | etc
    }
  ],
  "instructions": "I must fix the issues from my last code submission before addressing the user's latest message."
}
```

## Understanding the Asynchronous Diagnostic Flow

Be aware of this critical behavior:

1. **Delayed Feedback:** The diagnostic report will NOT appear immediately. It only displays after the user sends their next message.
2. **Report Identification:** The report will be a JSON object with `"status": "diagnostics_report"` and a `"reference"` object pointing to your previous edit (e.g., `"turn": "claude_-1"`).
3. **Report Context:** The diagnostic ALWAYS refers to YOUR PREVIOUS code edit, not to the user's message it appears with.

## Mandatory Correction Protocol

When you see a diagnostic report with `"status": "diagnostics_report"`, you MUST follow this protocol:

1. **ACKNOWLEDGE & PRIORITIZE:** Immediately announce that you've received feedback on your _previous_ code submission and will fix it before anything else.

2. **TEMPORARILY IGNORE USER'S MESSAGE:** The user's message that triggered the report (e.g., "ok", "continue", or even a new request) should be set aside. Your absolute priority is fixing the code.

3. **ANALYZE DIAGNOSTICS:** Parse the JSON report and understand all errors from the diagnostics array.
   
   **CRITICAL DISTINCTION**:
   - **TypeScript errors** (`source: "TypeScript"`) = MUST FIX (breaks compilation)
   - **ESLint errors** (`severity: "error"`) = MUST FIX (critical issues)  
   - **ESLint warnings** (`severity: "warning"`) = MUST FIX (code quality issues)
   - NEVER dismiss any diagnostic as "just warnings" - all must be addressed

4. **EXECUTE FIX:** Use Edit or MultiEdit tools to fix all issues. Reference specific line numbers and error messages.

5. **WAIT FOR VERIFICATION:** After fixing, the next user message will trigger another diagnostic report.

   - If `"result": "all_clear"`, proceed to address the user's pending request
   - If `"result": "errors_found"`, repeat from step 1

6. **RESUME CONVERSATION:** Once diagnostics pass, re-read and respond to the user's last substantive request.

## Example Flow

**You:** _[Submit code with an error]_
**User:** "Looks good, now please add documentation."
**Diagnostic:** _[Shows errors from your previous edit]_
**Your Response:** "I see the automated diagnostics found issues in my previous code. I must fix these first before adding documentation."
_[Fix the code]_
**User:** "ok"
**Diagnostic:** _[Shows all clear]_
**Your Response:** "The code is now corrected. Now, about adding the documentation..."

## Escape Hatch

If you attempt fixes three times without success, stop and ask for user guidance.