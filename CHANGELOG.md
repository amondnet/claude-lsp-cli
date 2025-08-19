# Changelog

## v3.1.0 - Language Server Fixes & Testing (Current)

### 🎯 Language Server Improvements
- **Fixed Go language server** - Added Go bin paths to findExecutable() 
- **Fixed C++ diagnostics** - Added URL decoding for file paths with special characters
- **Added C# language support** - Configuration for OmniSharp language server
- **Enhanced path detection** - Better executable finding for Rust, Go, and other tools
- **Improved version checking** - Support for different version command formats

### 📊 Verified Language Support (5/10 Working)
- **✅ TypeScript** - Full diagnostics, auto-installs  
- **✅ JavaScript** - Full diagnostics via TypeScript server
- **✅ Go** - Full diagnostics (requires gopls installation)
- **✅ C/C++** - Full diagnostics (requires clangd)
- **✅ PHP** - Full diagnostics (auto-installs Intelephense)

### 🔧 Known Issues
- **Python (Pyright)** - Workspace configuration issue (complex fix required)
- **Rust** - Needs proper Cargo.toml project structure
- **Java, Ruby, C#** - Require manual server installation

### 🧪 Testing Infrastructure
- **Comprehensive test suite** - Tests all 10 configured languages
- **Honest documentation** - Updated claims to reflect actual working status

## v3.0.0 - Complete Security Overhaul & Open Source Release

### 🔒 Critical Security Fixes
- **REMOVED all authentication** - Previous auth system was vulnerable to bypass
- **Unix socket with 0600 permissions** - Now relies on filesystem security only
- **Fixed command injection** - All exec() replaced with safe spawn() calls
- **Fixed path traversal** - Comprehensive path validation added
- **Upgraded hashing** - MD5 replaced with SHA-256
- **Added rate limiting** - Prevents DoS attacks

### 🏗️ Major Changes
- **Security-first rewrite** - Removed vulnerable authentication system entirely
- **Unix socket security model** - Filesystem permissions as security boundary
- **Fixed critical bugs** - Missing LSPClient methods that caused crashes
- **TypeScript fixes** - Resolved compilation errors with Bun types
- **CLI management restored** - Added status, start, stop, kill-all commands

### 📦 Simplified Architecture
- **Single security model** - Unix socket with filesystem permissions
- **No authentication tokens** - Removed complex auth that was bypassable
- **Environment variables** - Configuration via CLAUDE_LSP_CLI_PATH
- **Cleaner codebase** - Removed unnecessary auth complexity

### 🐛 Critical Bug Fixes
- Fixed missing `initializeTypeScript()` and `initializePython()` methods
- Fixed TypeScript error with unix socket property in Bun.serve
- Fixed missing `shutdown()` method references
- Replaced all unsafe shell operations with secure alternatives
- Fixed all path traversal vulnerabilities

### 🚀 Performance & Reliability
- Persistent LSP servers between Claude sessions
- Automatic cleanup of idle servers
- Proper process management with cleanup handlers
- Reduced overhead without auth checks

## v2.0.0 - Initial Enhanced Version
- Support for 25+ programming languages
- Auto-detection and installation of language servers
- Unix socket communication
- Claude Code hook integration