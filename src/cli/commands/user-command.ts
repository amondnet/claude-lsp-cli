import { runCheck } from './check';
import { enableLanguage, disableLanguage } from './config';
import { showHelp } from './help';

export async function handleUserCommand(prompt: string): Promise<string | null> {
  // Check if prompt starts with >lsp: (case insensitive) and is a single line
  if (!prompt.toLowerCase().startsWith('>lsp:') || prompt.includes('\n')) {
    return null;
  }
  
  const parts = prompt.slice(5).trim().split(/\s+/);
  const command = parts[0];
  const args = parts.slice(1);
  
  // Handle >lsp: commands and return the result as a string
  if (command === 'enable') {
    return await enableLanguage(args[0], null);
  } else if (command === 'disable') {
    return await disableLanguage(args[0], null);
  } else if (command === 'check') {
    // For check command, capture the output
    let output = '';
    await runCheck(args[0], (msg) => { output += msg + '\n'; });
    return output || 'File checked successfully';
  } else {
    return await showHelp(null);
  }
}