import { join, dirname } from 'path';
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  fsyncSync,
  openSync,
  closeSync,
} from 'fs';
import { showStatus } from './help';

export function loadConfig(): Record<string, unknown> {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  const configPath = join(homeDir, '.claude', 'lsp-config.json');
  let config: Record<string, unknown> = {};
  if (existsSync(configPath)) {
    config = JSON.parse(readFileSync(configPath, 'utf8'));
  }
  return config;
}

function updateConfig(updates: Record<string, unknown>): void {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  const configPath = join(homeDir, '.claude', 'lsp-config.json');
  let config: Record<string, unknown> = {};

  // Read existing config
  try {
    if (existsSync(configPath)) {
      config = JSON.parse(readFileSync(configPath, 'utf8'));
    }
  } catch {
    // Start with empty config if parsing fails
  }

  // Apply updates
  Object.assign(config, updates);

  // Ensure directory exists
  const dir = dirname(configPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  // Write updated config
  writeFileSync(configPath, JSON.stringify(config, null, 2));

  // Force file system sync to prevent race conditions in Node 20
  try {
    if (fsyncSync) {
      const fd = openSync(configPath, 'r');
      fsyncSync(fd);
      closeSync(fd);
    }
  } catch {
    // Fallback: just continue if fsync fails
  }
}

export async function disableLanguage(
  language: string,
  includeStatus: boolean = true
): Promise<string> {
  // Normalize language names to match what the checker expects
  const langMap: Record<string, string> = {
    typescript: 'TypeScript',
    python: 'Python',
    go: 'Go',
    rust: 'Rust',
    java: 'Java',
    cpp: 'Cpp',
    'c++': 'Cpp',
    c: 'Cpp',
    php: 'Php',
    scala: 'Scala',
    lua: 'Lua',
    elixir: 'Elixir',
    terraform: 'Terraform',
    all: 'all',
  };

  const normalizedLang = langMap[language.toLowerCase()] || language;

  const messages: string[] = [];

  if (normalizedLang === 'all') {
    updateConfig({ disable: true });
    messages.push(`🚫 Disabled ALL language checking globally`);
  } else if (language.toLowerCase() in langMap) {
    const langKey = `disable${normalizedLang}`;
    updateConfig({ [langKey]: true });
    messages.push(`🚫 Disabled ${language} checking globally`);
  } else {
    messages.push(
      `❌ Unknown language: ${language}. Valid languages: ${Object.keys(langMap)
        .filter((k) => k !== 'all')
        .join(', ')}`
    );
  }

  // Get status and return combined message (optional for performance)
  if (includeStatus) {
    const status = await showStatus();
    return messages.join('\n') + '\n' + status;
  }
  return messages.join('\n');
}

export async function enableLanguage(
  language: string,
  includeStatus: boolean = true
): Promise<string> {
  // Normalize language names to match what the checker expects
  const langMap: Record<string, string> = {
    typescript: 'TypeScript',
    python: 'Python',
    go: 'Go',
    rust: 'Rust',
    java: 'Java',
    cpp: 'Cpp',
    'c++': 'Cpp',
    c: 'Cpp',
    php: 'Php',
    scala: 'Scala',
    lua: 'Lua',
    elixir: 'Elixir',
    terraform: 'Terraform',
    all: 'all',
  };

  const normalizedLang = langMap[language.toLowerCase()] || language;

  const messages: string[] = [];

  if (normalizedLang === 'all') {
    updateConfig({ disable: false });
    messages.push(`✅ Enabled ALL language checking globally`);
  } else if (language.toLowerCase() in langMap) {
    const langKey = `disable${normalizedLang}`;
    updateConfig({ [langKey]: false });
    messages.push(`✅ Enabled ${language} checking globally`);
  } else {
    messages.push(
      `❌ Unknown language: ${language}. Valid languages: ${Object.keys(langMap)
        .filter((k) => k !== 'all')
        .join(', ')}`
    );
  }

  // Get status and return combined message (optional for performance)
  if (includeStatus) {
    const status = await showStatus();
    return messages.join('\n') + '\n' + status;
  }
  return messages.join('\n');
}
