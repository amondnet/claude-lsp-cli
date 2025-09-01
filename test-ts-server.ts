#!/usr/bin/env bun

import { spawn } from 'child_process';

// Test if typescript-language-server is available
console.log('Testing TypeScript Language Server...\n');

const proc = spawn('typescript-language-server', ['--version'], {
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

proc.on('close', (code) => {
  if (code === 0) {
    console.log('✅ TypeScript Language Server found:');
    console.log(output);
  } else {
    console.log('❌ TypeScript Language Server not found or error:');
    console.log('Exit code:', code);
    console.log('Stdout:', output);
    console.log('Stderr:', error);
    
    console.log('\nTrying npx...');
    const npxProc = spawn('npx', ['-y', 'typescript-language-server', '--version'], {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    let npxOutput = '';
    npxProc.stdout.on('data', (data) => {
      npxOutput += data.toString();
    });
    
    npxProc.on('close', (npxCode) => {
      if (npxCode === 0) {
        console.log('✅ Works with npx:');
        console.log(npxOutput);
      } else {
        console.log('❌ npx also failed');
      }
    });
  }
});