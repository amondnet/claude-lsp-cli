# Scala (Metals) Language Server Issues

## Summary
Scala support was added and tested, but Metals language server doesn't send diagnostics despite successful initialization and build import.

## Current Status: ❌ NOT WORKING

## What Works
✅ Metals installs correctly via Coursier (`cs install metals`)
✅ Server starts and initializes 
✅ Handles `window/showMessageRequest` for build import
✅ Successfully imports sbt build
✅ Creates .metals directory and starts Bloop compilation server

## What Doesn't Work
❌ No diagnostics are sent for files with obvious errors
❌ Complex build system integration required

## Technical Details

### Test Results
- Created test project with `build.sbt`
- Created Scala file with type errors
- Metals successfully:
  - Started and initialized
  - Prompted for build import (handled automatically)
  - Ran `sbt bloopInstall` 
  - Started Bloop compilation server
  - Created project structure (.metals, .bloop directories)
- But: Never sent any diagnostics even after 30+ seconds

### Metals Log Shows Success
```
Started: Metals version 1.6.2
running sbt bloopInstall
Generated .bloop/root.json
Starting compilation server
Found a Bloop server running
```

## Root Cause Analysis

Similar to Python, Scala/Metals has complex requirements:

1. **Build System Integration**: Requires full sbt/Maven/Gradle import
2. **Compilation Server**: Needs Bloop server for compilation
3. **Indexing**: Must index entire project before analysis
4. **Slow Startup**: Takes 15-30 seconds just for initial setup

## Comparison with Working Languages

| Aspect | TypeScript/Go/C++ | Scala (Metals) |
|--------|-------------------|----------------|
| Startup | <1 second | 15-30 seconds |
| Build Import | Not needed | Required |
| Compilation Server | No | Yes (Bloop) |
| Project Structure | Optional | Required |
| Diagnostics | Immediate | After full build |

## Recommendation

Like Python, Scala requires a fundamentally different integration approach than our lightweight LSP client provides. Metals is designed for IDEs with:
- Full build tool integration
- Background compilation servers
- Project-wide indexing
- Complex workspace management

**Status: Won't Fix** - Architectural incompatibility with our file-focused approach