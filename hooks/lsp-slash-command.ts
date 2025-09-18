#!/usr/bin/env bun

/**
 * UserPromptSubmit hook to handle /lsp commands
 * Intercepts /lsp commands and runs claude-lsp-cli directly
 */

import { execCommand } from '../src/utils/common';

const input = await Bun.stdin.text();
const message = JSON.parse(input);

// Check if message starts with /lsp
if (message.prompt?.startsWith('/lsp ')) {
  const parts = message.prompt.split(' ');
  const command = parts[1]; // enable, disable, status
  const args = parts.slice(2); // language name if any

  try {
    // Run the CLI command using utility function to prevent zombies
    const { stdout, stderr, exitCode } = await execCommand(['claude-lsp-cli', command, ...args]);

    // Replace the prompt with the result
    if (exitCode === 0) {
      message.prompt = `Result of 'claude-lsp-cli ${command} ${args.join(' ')}':\n\n${stdout}${stderr}`;
    } else {
      message.prompt = `Error: claude-lsp-cli ${command} ${args.join(' ')} failed with exit code ${exitCode}:\n\n${stderr || stdout}`;
    }
  } catch (err) {
    message.prompt = `Error running LSP command: ${err}`;
  }
}

// Return the (possibly modified) message
console.log(JSON.stringify(message));
