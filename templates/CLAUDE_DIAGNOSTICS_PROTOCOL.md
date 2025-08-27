# LSP Diagnostic Protocol

`[[system-message]]:` + JSON = automated diagnostic report from LSP analysis.

**Timing:** Appears after tool use, triggered by file changes.

Format: `{"diagnostics":[...],"summary":"..."}` 
- Summary shows total count + per-language breakdown (e.g. "total: 25 diagnostics (typescript: 20, python: 5)")
- `"summary": "no warnings or errors"` = all issues fixed

