# LSP Diagnostic Protocol

`[[system-message]]:` + JSON = automated diagnostic report from LSP analysis.

**Timing:** Appears after tool use, triggered by file changes.

Format: `{"diagnostics":[...],"summary":"..."}` 
- Summary shows total count(e.g. "25 errors, 1 warnings")

