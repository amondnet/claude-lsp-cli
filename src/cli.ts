#!/usr/bin/env bun

/**
 * Claude LSP CLI - Simple file-based diagnostics
 *
 * Usage:
 *   claude-lsp-cli [options] <command> [args]
 *
 * Commands:
 *   hook <event-type>     - Handle Claude Code hook events
 *   check <file>          - Check file for errors
 *   disable <language>    - Disable language checking
 *   enable <language>     - Enable language checking
 *   help                  - Show help
 *
 * Global Options:
 *   --port, -p <port>     - Set port for language servers
 *   --browser, -b <name>  - Set browser for web-based tools
 *
 * Environment Variables:
 *   PORT                  - Default port for language servers
 *   BROWSER               - Default browser for web-based tools
 */

import { runCheck, enableLanguage, disableLanguage, showHelp } from './cli/commands';
import { handlePostToolUse } from './cli/hooks/post-tool-use';
import { parseArguments } from './cli/utils/arg-parser';

// Parse command line arguments
const rawArgs = Bun.argv.slice(2);

// Check if this looks like the binary invocation path (no real args provided)
// This happens when argv[2] contains a path to claude-lsp-cli
let args: string[];
if (rawArgs.join(' ') === 'claude-lsp-cli') {
  // No real command was provided, Bun filled argv[2] with the invocation path
  args = [];
} else {
  args = rawArgs;
}

const parsed = parseArguments(args);
const command = parsed.command;
const commandArgs = parsed.args;

async function handleHookEvent(eventType: string): Promise<void> {
  const input = await Bun.stdin.text();

  if (eventType === 'PostToolUse') {
    await handlePostToolUse(input);
  } else {
    console.error(`Unknown event type: ${eventType}`);
    process.exit(1);
  }
}

// Main execution
(async () => {
  if (command === 'hook') {
    await handleHookEvent(commandArgs[0]);
  } else if (command === 'check') {
    await runCheck(commandArgs[0]);
  } else if (command === 'disable') {
    const result = await disableLanguage(commandArgs[0]);
    console.log(result);
  } else if (command === 'enable') {
    const result = await enableLanguage(commandArgs[0]);
    console.log(result);
  } else if (command === 'help') {
    await showHelp();
  } else {
    await showHelp();
  }
  // CLI always exits 0 (success) - only hooks use non-zero exit codes
  process.exit(0);
})();
