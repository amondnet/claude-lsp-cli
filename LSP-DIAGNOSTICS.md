# LSP Diagnostic Capabilities

This document describes the diagnostic capabilities of all Language Server Protocol (LSP) servers supported by Claude Code LSP.

## Supported Language Servers (12 Total)

| Language | LSP Server | Scope | Timing | Key Features | Notes |
|----------|------------|-------|--------|--------------|-------|
| **TypeScript/JS** | `typescript-language-server` | Project-wide + File | Real-time | Type checking, syntax errors, unused variables/imports, unreachable code, ESLint integration | Very comprehensive diagnostics |
| **Python** | `pylsp` | File (primarily) | On save/open | Syntax errors, import errors, undefined variables, type hints, pylint/flake8/pycodestyle | Requires plugins. Alternative: Pyright |
| **Rust** | `rust-analyzer` | Project-wide | Real-time | Compilation errors, borrow checker, type mismatches, unused code, Clippy lints | Runs `cargo check` automatically |
| **Go** | `gopls` | Project-wide + File | Real-time | Compilation errors, type errors, unused variables/imports, vet checks, staticcheck | Module-aware, very fast |
| **Java** | `jdtls` (Eclipse) | Project-wide | Real-time | Compilation errors, type checking, null pointer analysis, resource leaks, code style | Requires Maven/Gradle, memory intensive |
| **C/C++** | `clangd` | File (with compile DB) | Real-time | Compilation errors/warnings, undefined symbols, type mismatches, memory safety, clang-tidy | Needs `compile_commands.json` |
| **Ruby** | `solargraph` | Project-wide + File | On save/open | Syntax errors, undefined methods/variables, type inference, RuboCop, YARD docs | Better with type annotations |
| **Scala** | `metals` | Project-wide | Real-time | Compilation errors, type errors, unused imports/variables, Scalafmt, Scalafix | Requires sbt/Maven/Gradle |
| **PHP** | `phpactor` | File (primarily) | On save/open | Syntax errors, undefined functions/classes, type mismatches (PHPDoc), PSR violations | Alternative: Intelephense (paid) |
| **Lua** | `lua-language-server` | Project-wide + File | Real-time | Syntax errors, undefined globals, type checking (annotations), deprecated API usage | Works with Love2D, OpenResty, etc |
| **Elixir** | `elixir-ls` | Project-wide | On save | Compilation errors, pattern matching warnings, unused variables, Dialyzer, Credo | Requires Mix project |
| **Terraform** | `terraform-ls` | File + Module-aware | Real-time | Syntax errors, invalid references, type mismatches, deprecated resources, provider conflicts | Requires `terraform init` |

## Diagnostic Capabilities Details

### Scope Types
- **Project-wide**: Analyzes entire project, understands cross-file dependencies
- **File**: Analyzes individual files in isolation
- **Module-aware**: Understands module boundaries and dependencies

### Timing Types
- **Real-time**: Diagnostics update as you type
- **On save/open**: Diagnostics update when file is saved or opened

### Feature Categories

| Feature | Languages Supporting It |
|---------|------------------------|
| **Type Checking** | TypeScript, Python (with plugins), Rust, Go, Java, C/C++, Scala, PHP (with PHPDoc), Lua (with annotations) |
| **Compilation Errors** | Rust, Go, Java, C/C++, Scala, Elixir |
| **Unused Code Detection** | TypeScript, Python, Rust, Go, Java, Scala, Ruby, Lua, Elixir |
| **Linter Integration** | TypeScript (ESLint), Python (pylint/flake8), Rust (Clippy), Ruby (RuboCop), Scala (Scalafix), Elixir (Credo) |
| **Null/Memory Safety** | Java, C/C++, Rust |
| **Style Violations** | Java, PHP (PSR), Scala (Scalafmt), Ruby (RuboCop) |

## Diagnostic Behavior Summary

### Real-time Diagnostics (as you type)
- TypeScript, Rust, Go, Java, C/C++, Scala, Lua, Terraform

### On-save Diagnostics
- Python, Ruby, PHP, Elixir

### Project-wide Analysis
- TypeScript, Rust, Go, Java, Scala, Elixir, Ruby, Lua

### File-specific Only
- PHP (primarily), C/C++ (without compilation database)

## Current Implementation Notes

In Claude Code LSP, we handle diagnostics uniformly:

1. **Project-wide diagnostics**: Opens ALL project files and collects diagnostics from all LSPs
2. **File-specific diagnostics**: Uses the same approach but filters results to the requested file

This ensures compatibility with all LSPs regardless of their native capabilities, though it may be inefficient for LSPs that support targeted file analysis.

## Installation Status

To check which LSPs are installed on your system:
```bash
claude-lsp-cli list-servers
```

This will show:
- ✅ Installed and available
- ❌ Not installed (with installation instructions)
- ⚠️ Partially configured (may need additional setup)