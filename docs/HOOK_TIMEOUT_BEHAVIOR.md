# Claude Code Hook Timeout Behavior

## Overview

This document describes the timeout behavior for Claude Code hooks based on analysis of the deobfuscated source code.

## Key Findings

### Default Hook Timeout: 60 seconds

- **Location**: `/Users/steven_chong/.claude/data/unminified/webcrack-output/deobfuscated.js`
- **Line 411186**: `var RS = 60000;` (60000ms = 60 seconds)
- This is the default timeout for ALL hook executions
- Applied when no custom timeout is specified in hook configuration

### No 5-second Return Timeout

- **Contrary to initial assumptions**, hooks do NOT have a 5-second return timeout
- Hooks can run for the full timeout duration (60 seconds by default)
- The LSP integration should be designed to handle long-running hooks

### No Separate Kill Timeout

- **There is NO separate 30-second kill timeout**
- Uses a single timeout value with AbortSignal for graceful termination
- Process receives AbortSignal when timeout is reached

## Implementation Details

### Hook Execution Flow

1. **Timeout Calculation** (line 411571):

```javascript
let O = N.timeout ? N.timeout * 1000 : D;
```

- Uses custom timeout from hook config (converted from seconds to milliseconds)
- Falls back to default `RS = 60000` if not specified

2. **AbortSignal Implementation** (lines 411574-411579):

```javascript
if (Z) {
  let y = lSB(Z, AbortSignal.timeout(O));
  R = y.signal;
  P = y.cleanup;
} else {
  R = AbortSignal.timeout(O);
}
```

- Uses `AbortSignal.timeout(O)` to enforce timeout
- Properly handles signal cleanup
- Supports signal composition when parent signal exists

3. **Process Spawning** (line 411369):

```javascript
let G = OY8(D, [], {
  env: {
    ...process.env,
    CLAUDE_PROJECT_DIR: Z,
  },
  cwd: o0(),
  shell: true,
  signal: Q,
});
```

- Uses spawn with `shell: true` for command execution
- Passes AbortSignal for timeout control
- Process receives signal for graceful termination

### Hook Status Reporting (line 411582-411596):

```javascript
Q0(`Executing hook command: ${N.command} with timeout ${O}ms`);
let y = await pN0(N.command, W, R);
// ...
if (y.aborted) {
  return {
    message: U3(`${s1.bold(I)} [${N.command}] ${s1.yellow('cancelled')}`, 'info', B),
    outcome: 'cancelled',
  };
}
```

- Logs timeout value for debugging
- Properly reports cancelled/aborted status
- Returns structured outcome for hook result

## Implications for Claude Code LSP

### Design Considerations

1. **Timeout Handling**:
   - The LSP hook integration should NOT assume a 5-second timeout
   - Must handle hooks that run for up to 60 seconds
   - Consider implementing own timeout if faster response is needed

2. **Pending Queue Strategy**:
   - Current implementation correctly uses a pending queue
   - Files are marked as pending and checked on next hook trigger
   - This avoids blocking on long-running hooks

3. **User Configuration**:
   - Hooks can have custom timeouts specified in `settings.json`
   - Timeout is specified in seconds in the configuration
   - Internally converted to milliseconds for execution

### Best Practices

1. **Don't Wait for Hook Completion**:
   - Store file edits in pending queue
   - Return immediately to avoid blocking
   - Process diagnostics on next hook trigger

2. **Respect Hook Timeouts**:
   - Allow hooks to run for their configured duration
   - Don't force early termination
   - Handle timeout gracefully with proper status reporting

3. **Monitor Hook Performance**:
   - Log hook execution times
   - Warn users about slow hooks
   - Consider implementing metrics for hook performance

## Configuration Example

Hooks can specify custom timeouts in `settings.json`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "type": "command",
        "command": "claude-lsp-cli hook PostToolUse",
        "timeout": 10 // Custom 10-second timeout
      }
    ]
  }
}
```

If no timeout is specified, the default 60-second timeout applies.

## Summary

- **Default timeout**: 60 seconds (not 5 seconds)
- **No separate kill timeout**: Single timeout with AbortSignal
- **Configurable**: Can be customized per hook in settings
- **Graceful termination**: Uses AbortSignal for clean shutdown
- **LSP implications**: Must handle long-running hooks appropriately
