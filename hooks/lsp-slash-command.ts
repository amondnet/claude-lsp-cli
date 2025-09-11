#!/usr/bin/env bun

/**
 * UserPromptSubmit hook to handle /lsp commands
 * Intercepts /lsp commands and runs claude-lsp-cli directly
 */

import { spawn } from "bun";

const input = await Bun.stdin.text();
const message = JSON.parse(input);

// Check if message starts with /lsp
if (message.prompt?.startsWith('/lsp ')) {
  const parts = message.prompt.split(' ');
  const command = parts[1]; // enable, disable, status
  const args = parts.slice(2); // language name if any
  
  try {
    // Run the CLI command
    const proc = spawn(['claude-lsp-cli', command, ...args], {
      stdout: 'pipe',
      stderr: 'pipe'
    });
    
    const output = await new Response(proc.stdout).text();
    const error = await new Response(proc.stderr).text();
    
    // Replace the prompt with the result
    message.prompt = `Result of 'claude-lsp-cli ${command} ${args.join(' ')}':\n\n${output}${error}`;
  } catch (err) {
    message.prompt = `Error running LSP command: ${err}`;
  }
}

// Return the (possibly modified) message
console.log(JSON.stringify(message));