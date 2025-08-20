# Claude Code Hook Documentation

Based on analysis of Claude Code source (cli-v1.0.80.js)

## Hook Event Types

Found at line 380802 in the source code:
```javascript
var keA = [ "PreToolUse", "PostToolUse", "Notification", "UserPromptSubmit", "SessionStart", "Stop", "SubagentStop", "PreCompact" ]
```

## Hook Exit Codes

Found at lines 428810-428850 in the source code:

### Universal Exit Code Meanings:
- **Exit code 0**: Hook succeeded (normal success)
- **Exit code 2**: Special "blocking" status - behavior depends on hook type (see below)
- **Any other exit code (1, 3, etc.)**: Non-blocking error (shows warning but continues)

### Source Code Evidence:
```javascript
if ( j.status === 0 ) {
  // Hook completed successfully
  return { outcome: "success" }
}

if ( j.status === 2 ) return {
  blockingError: { blockingError: `[${N.command}]: ${j.stderr||"No stderr output"}` },
  outcome: "blocking"  // THIS BLOCKS THE TOOL!
};

// Any other exit code
return {
  message: `failed with non-blocking status code ${j.status}: ${j.stderr||"No stderr output"}`,
  outcome: "non_blocking_error"
}
```

## Hook Type Specific Behaviors

### 1. PreToolUse
- **Purpose**: Runs before a tool is executed
- **Stdout handling**: Shown as info message if exit code 0
- **Stderr handling**: Shown in error messages if exit code != 0
- **Exit code 0**: Tool execution continues
- **Exit code 2**: Tool execution is BLOCKED
- **Other exit codes**: Warning shown, tool still executes
- **Special JSON fields**:
  - `permissionDecision`: "allow" | "deny" | "ask"
  - `permissionDecisionReason`: Explanation for permission decision

### 2. PostToolUse
- **Purpose**: Runs after a tool is executed  
- **Stdout handling**: Shown as info message if exit code 0
- **Stderr handling**: Shown in error messages if exit code != 0
- **Exit code 0**: Success message shown
- **Exit code 2**: Shows "operation feedback" message (uses GjB function) but Claude CONTINUES
- **Other exit codes**: Warning shown
- **IMPORTANT**: Exit code 2 does NOT block Claude from continuing after PostToolUse

### 3. UserPromptSubmit
- **Purpose**: When user submits a prompt
- **Stdout handling**: Becomes `additionalContext` that's added to the prompt (G=true in source)
- **Stderr handling**: Shown in error messages if exit code != 0
- **Exit code 0**: Stdout is added as additional context to user's prompt
- **Exit code 2**: Blocks prompt submission
- **Other exit codes**: Warning shown, prompt continues
- **Special behavior**: stdout automatically becomes `additionalContext`

### 4. SessionStart
- **Purpose**: When a Claude session starts
- **Stdout handling**: Becomes `additionalContext` (G=true in source)
- **Stderr handling**: Shown in error messages if exit code != 0
- **Exit code 0**: Success, stdout added as context
- **Exit code 2**: Blocks session start
- **Other exit codes**: Warning shown

### 5. Stop / SubagentStop
- **Purpose**: When session/subagent stops
- **Stdout handling**: Shown as info message if exit code 0
- **Stderr handling**: Shown in error messages if exit code != 0
- **Exit codes**: Same as standard pattern

### 6. Notification
- **Purpose**: For notifications
- **Stdout/Stderr**: Standard handling
- **Exit codes**: Same as standard pattern

### 7. PreCompact
- **Purpose**: Before compaction
- **Stdout/Stderr**: Standard handling
- **Exit codes**: Same as standard pattern

## Hook JSON Output Format

Hooks can output JSON instead of plain text for structured responses:

```json
{
  "continue": "boolean - Set to false to trigger immediate Claude response",
  "suppressOutput": "boolean - Suppress default output messages", 
  "stopReason": "string - Reason for stopping when continue is false",
  "decision": "approve | block - For PreToolUse hooks",
  "reason": "string - Explanation for decision",
  "systemMessage": "string - Message to show as system warning",
  "permissionDecision": "allow | deny | ask - For PreToolUse",
  "permissionDecisionReason": "string - For PreToolUse",
  "additionalContext": "string - For UserPromptSubmit (or use stdout)"
}
```

### Triggering Immediate Claude Response

**Found in source at line 428665**: When a hook returns JSON with `"continue": false`, it sets `preventContinuation = true` which triggers Claude to respond immediately.

Example to trigger immediate response:
```json
{
  "continue": false,
  "stopReason": "Diagnostics found critical errors",
  "systemMessage": "Build failed - review errors above"
}
```

## Important Notes

1. **Exit code 2 behavior varies by hook type**:
   - **PreToolUse**: BLOCKS tool execution (DjB function: "operation blocked by hook")
   - **PostToolUse**: Shows feedback but Claude CONTINUES (GjB function: "operation feedback")
   - **UserPromptSubmit**: BLOCKS prompt submission (IjB function)
   - **Stop/SubagentStop**: Shows feedback but doesn't block (FjB function)

2. **UserPromptSubmit and SessionStart are special**: Their stdout automatically becomes `additionalContext` without needing JSON.

3. **JSON output is optional**: Hooks can return plain text (stdout) or JSON. If JSON parsing fails, stdout is treated as plain text.

4. **The user's assumption was incorrect**: PostToolUse with exit code 2 does NOT stop Claude. It only shows feedback.

## Hook Configuration Format

From line 381214:
```json
{
  "PostToolUse": [
    {
      "matcher": {
        "tools": ["BashTool"]
      },
      "hooks": [
        {
          "type": "command",
          "command": "echo Done"
        }
      ]
    }
  ]
}
```