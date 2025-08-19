# Python (Pyright) Language Server Issues

## Summary
After extensive testing and debugging, Pyright language server remains non-functional in our LSP client despite multiple attempted fixes.

## Current Status: ❌ NOT WORKING

## Issues Identified

### 1. Workspace Root Misconfiguration
Pyright uses its own installation directory as the workspace root instead of the project directory:
```
Server root directory: file:///Users/steven_chong/Downloads/repos/claude-code-lsp/node_modules/pyright/dist
```

### 2. No Diagnostics Sent
Despite proper initialization and file opening, Pyright sends 0 diagnostics for files with obvious errors.

## Attempted Fixes

### 1. Virtual Environment Detection ✅ Implemented
- Added automatic detection of common venv paths (`venv`, `.venv`, `env`, `.env`)
- Configured `pythonPath` in initialization options
- Result: No improvement

### 2. Workspace Configuration Handler ✅ Implemented  
- Added handler for `workspace/configuration` requests
- Returns proper Python configuration when requested
- Result: Configuration accepted but no diagnostics

### 3. Pyright Configuration File ✅ Created
- Created `pyrightconfig.json` with strict type checking
- Specified include paths and error reporting levels
- Result: No improvement

### 4. Initialization Options ✅ Updated
- Set `diagnosticMode` to both "workspace" and "openFilesOnly"
- Added `workspaceFolders` configuration
- Included both `rootUri` and `rootPath` for compatibility
- Result: No improvement

### 5. Extended Wait Time ✅ Implemented
- Increased wait time to 5 seconds for Python files
- Result: No diagnostics even with longer wait

## Root Cause Analysis

The fundamental issue appears to be that Pyright has complex requirements for workspace initialization that differ from standard LSP servers:

1. **Project Structure Requirements**: Pyright may require specific Python project markers (pyproject.toml, setup.py) to properly analyze files.

2. **Workspace vs File Analysis**: Pyright seems designed for whole-workspace analysis rather than individual file checking.

3. **Configuration Complexity**: The configuration system is more complex than other language servers, requiring multiple layers of configuration.

## Comparison with Working Servers

| Server | Initialization | Diagnostics | Configuration |
|--------|---------------|-------------|---------------|
| TypeScript | Simple | Immediate | Minimal |
| Go (gopls) | Simple | Immediate | None needed |
| C++ (clangd) | Simple | Immediate | None needed |
| PHP | Simple | Immediate | None needed |
| **Python (Pyright)** | Complex | None | Complex |

## Recommendation

Given the complexity and time invested without success, I recommend:

1. **Document as Known Issue**: List Python/Pyright as unsupported with explanation
2. **Consider Alternative**: Investigate `pylsp` (Python LSP Server) as replacement
3. **Future Investigation**: This needs deeper investigation with Pyright maintainers

## Alternative Python Language Servers to Consider

1. **pylsp** (Python LSP Server) - More standard LSP implementation
2. **jedi-language-server** - Simpler, Jedi-based server
3. **ruff-lsp** - Fast, Rust-based linter as LSP

## Technical Details for Future Reference

The issue is NOT related to:
- Installation (server starts successfully)
- Basic LSP protocol (initialization completes)
- File opening (documents are opened correctly)
- Message handling (all notifications/requests work)

The issue IS related to:
- Workspace root configuration
- Project structure detection
- Pyright's internal analysis triggering

## Code References
- Configuration handling: src/lsp-client.ts:139-175
- Initialization options: src/lsp-client.ts:385-421
- Debug script: debug-python.ts (comprehensive test)