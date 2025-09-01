#!/usr/bin/env bun

import { spawn } from 'child_process';
import { languageServers } from './src/language-servers';

const config = languageServers.typescript;
console.log('TypeScript config:');
console.log('  Command:', config.command);
console.log('  Args:', config.args);

// Test if the command works
console.log('\nTesting command execution...\n');

const proc = spawn(config.command, [...(config.args || []), '--version'], {
  stdio: ['pipe', 'pipe', 'pipe']
});

let output = '';
let error = '';

proc.stdout.on('data', (data) => {
  output += data.toString();
});

proc.stderr.on('data', (data) => {
  error += data.toString();
});

proc.on('error', (err) => {
  console.error('Failed to spawn process:', err);
});

proc.on('close', (code) => {
  console.log('Exit code:', code);
  if (output) console.log('Output:', output);
  if (error) console.log('Error:', error);
  
  if (code !== 0) {
    console.log('\nCommand failed! Trying alternative...\n');
    
    // Try with full path
    const proc2 = spawn('/Users/steven_chong/.local/share/mise/installs/node/20.18.0/bin/typescript-language-server', ['--version'], {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    let output2 = '';
    proc2.stdout.on('data', (data) => {
      output2 += data.toString();
    });
    
    proc2.on('close', (code2) => {
      console.log('Alternative exit code:', code2);
      if (output2) console.log('Alternative output:', output2);
    });
  }
});