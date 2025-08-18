# Changelog

## v2.1.0 - Security & Architecture Improvements

### 🔒 Security Enhancements
- **Added token-based authentication** for all API endpoints
- **Fixed critical command injection vulnerability** - replaced `execSync` with safe `spawn`
- **Fixed path traversal vulnerability** - validates all file paths stay within project
- **Implemented rate limiting** (100 req/min) to prevent DoS attacks
- **Upgraded from MD5 to SHA-256** for cryptographic hashing
- **Added secure token generation** using crypto.randomBytes(32)
- **Replaced unsafe shell commands** with native Node.js/Bun APIs
- **Added comprehensive error logging** with structured JSON output
- **Implemented proper resource cleanup** handlers

### 🏗️ Architecture Improvements
- **Created dedicated hook binary** (`claude-lsp-hook`) for cleaner integration
- **Added security utilities module** (`src/utils/security.ts`)
- **Added authentication manager** (`src/utils/auth.ts`)
- **Added structured logger** (`src/utils/logger.ts`)
- **Optimized SQLite connection management** with proper pooling
- **Removed hardcoded developer paths**

### 📦 New Binaries
- `bin/claude-lsp-cli` - Main CLI tool with multiple commands
- `bin/claude-lsp-server` - Secure LSP server with auth
- `bin/claude-lsp-hook` - Dedicated lightweight hook handler

### 🔧 Configuration Options
Three ways to configure Claude Code integration:
1. TypeScript hook directly (recommended for development)
2. Compiled hook binary (recommended for production - faster, smaller)
3. Full CLI with subcommands (for advanced usage)

### 📝 Documentation
- Comprehensive security documentation in README
- Clear authentication setup instructions
- Multiple configuration examples for different use cases

### ⚠️ Breaking Changes
- **API endpoints now require authentication** (except `/health`)
- **Token must be provided as Bearer token** in Authorization header
- **Rust-analyzer requires manual installation** (security: no more curl pipes)

### 🐛 Bug Fixes
- Fixed 20+ instances of silent error handling with empty catch blocks
- Fixed resource leaks with proper cleanup handlers
- Fixed PID file orphaning issues
- Fixed socket file cleanup on shutdown

### 🚀 Performance Improvements
- Optimized file watching with debouncing
- Better SQLite connection pooling
- Reduced context usage in hook processing
- Smaller binary sizes with dedicated hook handler

## v2.0.0 - Initial Enhanced Version
- Support for 25+ programming languages
- Auto-detection and installation of language servers
- Unix socket communication
- Claude Code hook integration