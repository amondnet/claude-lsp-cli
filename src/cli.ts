#!/usr/bin/env bun

/**
 * Claude LSP CLI - Simple file-based diagnostics
 *
 * Usage:
 *   claude-lsp-cli <command> [args]
 *
 * Commands:
 *   hook <event-type>     - Handle Claude Code hook events
 *   check <file>          - Check file for errors
 *   disable <language>    - Disable language checking
 *   enable <language>     - Enable language checking
 *   help                  - Show help
 */

import {
  runCheck,
  runCheckMultiple,
  enableLanguage,
  disableLanguage,
  showHelp,
} from './cli/commands';
import { handlePostToolUse } from './cli/hooks/post-tool-use';

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

// Simple argument parsing - just extract command and args
const command = args[0];
const commandArgs = args.slice(1);

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
void (async () => {
  if (command === 'hook') {
    const eventType = commandArgs[0];
    if (!eventType) {
      console.error('Event type required for hook command');
      process.exit(1);
    }
    await handleHookEvent(eventType);
  } else if (command === 'check') {
    // Support checking multiple files for better performance
    if (commandArgs.length > 1) {
      await runCheckMultiple(commandArgs);
    } else {
      const file = commandArgs[0];
      if (!file) {
        // Exit silently when file argument is missing (for compatibility with tests)
        process.exit(1);
      }
      await runCheck(file);
    }
  } else if (command === 'disable') {
    const language = commandArgs[0];
    if (!language) {
      console.error('Language required for disable command');
      process.exit(1);
    }
    const result = await disableLanguage(language);
    console.log(result);
  } else if (command === 'enable') {
    const language = commandArgs[0];
    if (!language) {
      console.error('Language required for enable command');
      process.exit(1);
    }
    const result = await enableLanguage(language);
    console.log(result);
  } else if (command === 'help') {
    await showHelp();
  } else {
    await showHelp();
  }
  // CLI always exits 0 (success) - only hooks use non-zero exit codes
  process.exit(0);
})();
