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
- **Exit code 0**: Hook succeeded (normal success) - no errors found, no message shown to user
- **Exit code 2**: Special status - behavior depends on hook type:
  - **PostToolUse**: Shows diagnostic feedback to user (perfect for displaying code errors!)
  - **PreToolUse**: Blocks tool execution 
  - **UserPromptSubmit**: Blocks prompt submission
- **Exit code 1 or other non-zero**: Non-blocking error - hook itself failed, shows warning message but Claude continues

### Why You See "failed with non-blocking status code 1"
This message appears when a hook returns exit code 1, which typically means:
- The hook encountered an error (e.g., invalid JSON input, missing dependencies)
- The hook couldn't perform its task (e.g., language server not installed)
- The hook intentionally returned 1 to show a warning without blocking

For LSP hooks specifically, exit code 1 often occurs when:
- The working directory doesn't exist or isn't accessible
- JSON parsing fails on the input from Claude
- Language servers aren't installed or can't start
- No relevant files to check in the project

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

## LSP Diagnostics Implementation

Our LSP diagnostics hook uses exit codes strategically:
- **Exit 0**: No errors found in code
- **Exit 1**: Hook failed to run (timeout, crash, parse error)
- **Exit 2**: Errors found in code (for PostToolUse) - shows diagnostic feedback to user

This means when PostToolUse finds TypeScript/ESLint errors, it exits with code 2 to ensure the diagnostic report is visible to the user without blocking Claude's operation.

## Hook Data Structure (stdin JSON)

### Base Fields (all hooks receive these):
```json
{
  "session_id": "string - Current Claude session ID",
  "transcript_path": "string - Path to conversation transcript",
  "cwd": "string - Current working directory"
}
```

### Hook-Specific Additional Fields:

#### PreToolUse
```json
{
  "hook_event_name": "PreToolUse",
  "tool_name": "string - Name of tool being invoked (e.g., 'Edit', 'Write', 'Bash')",
  "tool_input": "object - The tool's input parameters"
}
```

#### PostToolUse
```json
{
  "hook_event_name": "PostToolUse",
  "tool_name": "string - Name of tool that was invoked",
  "tool_input": "object - The tool's input parameters",
  "tool_response": "object - The tool's output/response"
}
```

#### UserPromptSubmit
```json
{
  "hook_event_name": "UserPromptSubmit",
  "prompt": "string - The user's prompt text"
}
```

#### SessionStart
```json
{
  "hook_event_name": "SessionStart",
  "source": "string - Source of session start (e.g., 'cli', 'api')"
}
```

#### Stop / SubagentStop
```json
{
  "hook_event_name": "Stop" | "SubagentStop",
  "stop_hook_active": "boolean - Whether stop hook is active"
}
```

#### PreCompact
```json
{
  "hook_event_name": "PreCompact",
  "trigger": "string - What triggered compaction",
  "custom_instructions": "string - Custom instructions if any"
}
```

#### Notification
```json
{
  "hook_event_name": "Notification"
  // No additional fields beyond base fields
}
```

### Important Notes About Hook Data

1. **Not all hooks receive meaningful data**: Some hooks like Stop, SessionStart may receive minimal data
2. **Handle missing fields gracefully**: Always check if fields exist before accessing
3. **tool_input varies by tool**: The structure depends on which tool is being used
4. **JSON parsing may fail**: Always wrap JSON.parse in try-catch

### Example: Handling Missing Data

```bash
#!/bin/bash
# Safe hook that handles missing data

input=$(cat)

# Try to parse JSON, fallback to empty object
json=$(echo "$input" | jq '.' 2>/dev/null || echo '{}')

# Extract fields with defaults
event=$(echo "$json" | jq -r '.hook_event_name // "unknown"')
session=$(echo "$json" | jq -r '.session_id // "no-session"')
tool=$(echo "$json" | jq -r '.tool_name // "no-tool"')

# Process based on event type
case "$event" in
  "PostToolUse")
    echo "Tool $tool was used in session $session"
    ;;
  "SessionStart")
    echo "Session $session started"
    ;;
  *)
    echo "Event $event occurred"
    ;;
esac

exit 0
```

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