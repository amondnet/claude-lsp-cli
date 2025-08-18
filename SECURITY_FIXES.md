# Security Fixes Applied to Claude Code LSP

## Summary
This document outlines all security fixes and improvements applied to the Claude Code LSP project.

## Critical Security Vulnerabilities Fixed

### 1. ✅ Command Injection (CRITICAL)
**Files Fixed:**
- `src/utils/security.ts` - Created secure command execution utilities
- `src/language-servers.ts` - Removed dangerous curl pipe installation
- `src/diagnostics-fixed.ts` - Replaced shell commands with safe alternatives

**Changes:**
- Replaced all `execSync()` calls with `spawn()` using argument arrays
- Disabled shell interpretation in all process spawning
- Rust-analyzer now requires manual installation for security

### 2. ✅ Path Traversal (HIGH)
**Files Fixed:**
- `src/utils/security.ts` - Added `validatePathWithinRoot()` function
- `src/server-fixed.ts` - Validates all file paths from API requests

**Changes:**
- All user-provided paths are validated to stay within project root
- Relative path resolution checks prevent `../` escapes

### 3. ✅ Authentication & Authorization (HIGH)
**Files Fixed:**
- `src/utils/auth.ts` - New authentication system
- `src/server-fixed.ts` - Implements Bearer token authentication

**Features:**
- Token-based authentication for all API endpoints (except /health)
- Secure token generation using crypto.randomBytes
- Constant-time token comparison to prevent timing attacks
- Token stored with restricted permissions (0600)

## Additional Security Improvements

### 4. ✅ Secure Process Management
**Files Fixed:**
- `src/utils/security.ts` - Process cleanup manager
- `src/diagnostics-fixed.ts` - Uses safe process killing

**Changes:**
- Replaced `$\`kill ${pid}\`` with `process.kill()`
- Replaced `$\`rm -f ${file}\`` with `fs.unlink()`
- Automatic cleanup on process exit

### 5. ✅ Rate Limiting
**Files Fixed:**
- `src/utils/auth.ts` - RateLimiter class
- `src/server-fixed.ts` - Applies rate limiting

**Features:**
- 100 requests per minute per client
- Configurable limits
- Automatic cleanup of old entries

### 6. ✅ Improved Cryptography
**Changes:**
- Replaced MD5 with SHA-256 for all hashing
- Uses crypto.randomBytes for token generation

## Code Quality Improvements

### 7. ✅ Comprehensive Error Logging
**Files Fixed:**
- `src/utils/logger.ts` - Structured logging system
- All source files updated to use proper logging

**Features:**
- Structured JSON logging
- Log levels (ERROR, WARN, INFO, DEBUG)
- Context-aware logging
- File and console output

### 8. ✅ Resource Management
**Improvements:**
- SQLite connection pooling
- Proper cleanup handlers
- PID file management
- Socket file cleanup

### 9. ✅ Input Validation
**All API endpoints now validate:**
- File paths (prevent traversal)
- Request parameters
- Authentication tokens
- Rate limits

## Breaking Changes

### API Authentication Required
All API endpoints (except `/health`) now require a Bearer token:

```bash
# Get token from server startup logs or from file:
TOKEN=$(cat /tmp/claude-lsp-{projectHash}.token)

# Use in requests:
curl -H "Authorization: Bearer $TOKEN" http://localhost/diagnostics
```

### Installation Changes
- Rust-analyzer requires manual installation
- No more piped curl commands
- All installations use safe command execution

## Migration Instructions

### Automatic Migration
Run the provided migration script:
```bash
./migrate-to-secure.sh
```

This will:
1. Backup original files
2. Apply all security fixes
3. Rebuild binaries
4. Show summary of changes

### Manual Migration
If you prefer manual migration:

1. **Backup current files:**
   ```bash
   mkdir backups
   cp src/*.ts backups/
   ```

2. **Copy security utilities:**
   ```bash
   cp -r src/utils .
   ```

3. **Replace files with fixed versions:**
   ```bash
   cp src/cli-fixed.ts src/cli.ts
   cp src/diagnostics-fixed.ts src/diagnostics.ts
   cp src/server-fixed.ts src/server.ts
   ```

4. **Rebuild:**
   ```bash
   bun install
   bun run build
   ```

## Testing the Fixes

### 1. Test Authentication
```bash
# Start server
bun run src/server-fixed.ts /path/to/project

# Note the token from logs
# Try without token (should fail)
curl http://localhost:3939/diagnostics
# Expected: 401 Unauthorized

# Try with token (should work)
curl -H "Authorization: Bearer <token>" http://localhost:3939/diagnostics
```

### 2. Test Path Traversal Protection
```bash
# Try to access file outside project
curl -H "Authorization: Bearer <token>" \
  "http://localhost:3939/diagnostics?file=../../../../etc/passwd"
# Expected: 400 Bad Request - Invalid file path
```

### 3. Test Rate Limiting
```bash
# Send many requests quickly
for i in {1..150}; do
  curl -H "Authorization: Bearer <token>" http://localhost:3939/health
done
# Expected: After 100 requests, get 429 Too Many Requests
```

## Security Best Practices Going Forward

1. **Never use `execSync()` with string commands** - Always use `spawn()` with argument arrays
2. **Always validate file paths** - Use `validatePathWithinRoot()` for user-provided paths
3. **Never use MD5** - Use SHA-256 or better
4. **Always log errors** - Never have empty catch blocks
5. **Implement authentication** - Don't expose APIs without auth
6. **Use rate limiting** - Prevent DoS attacks
7. **Clean up resources** - Register cleanup handlers
8. **Validate all inputs** - Never trust user input

## Compliance & Standards

The security fixes align with:
- OWASP Top 10 security practices
- CWE-78 (OS Command Injection) mitigation
- CWE-22 (Path Traversal) prevention
- CWE-307 (Improper Authentication) fixes
- Security best practices for Node.js/Bun applications

## Future Recommendations

1. **Add HTTPS support** for production deployments
2. **Implement audit logging** for security events
3. **Add integration tests** for security features
4. **Consider using a security scanner** in CI/CD
5. **Regular dependency updates** for security patches
6. **Implement CSRF protection** if adding web UI
7. **Add request signing** for enhanced API security

## Contributors
- Security audit and fixes implemented as part of comprehensive code review
- All critical vulnerabilities addressed with priority
- Code quality significantly improved with proper error handling

---

**Note:** The original vulnerable code should never be deployed to production. Always use the secured versions with these fixes applied.