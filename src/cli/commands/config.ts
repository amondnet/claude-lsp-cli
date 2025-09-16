import { join, dirname } from 'path';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, renameSync } from 'fs';
import { showStatus } from './help';

// Use a hybrid approach: Bun APIs where they provide clear benefits
export function loadConfig(): Record<string, unknown> {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  const configPath = join(homeDir, '.claude', 'lsp-config.json');
  let config: Record<string, unknown> = {};

  if (existsSync(configPath)) {
    try {
      // For sync operations, fs is still fast and reliable
      config = JSON.parse(readFileSync(configPath, 'utf8'));
    } catch {
      // Return empty config if parsing fails
    }
  }
  return config;
}

function updateConfig(updates: Record<string, unknown>): void {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  const configPath = join(homeDir, '.claude', 'lsp-config.json');
  let config: Record<string, unknown> = {};

  // Read existing config
  if (existsSync(configPath)) {
    try {
      config = JSON.parse(readFileSync(configPath, 'utf8'));
    } catch {
      // Start with empty config if parsing fails
    }
  }

  // Apply updates
  Object.assign(config, updates);

  // Ensure directory exists
  const dir = dirname(configPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  // Atomic write using temp file
  const tempPath = configPath + '.tmp';
  const configContent = JSON.stringify(config, null, 2);

  try {
    writeFileSync(tempPath, configContent);
    // Atomic rename
    if (existsSync(configPath)) {
      rmSync(configPath);
    }
    renameSync(tempPath, configPath);
  } catch {
    // Fallback to direct write
    writeFileSync(configPath, configContent);
    // Clean up temp file if it exists
    try {
      if (existsSync(tempPath)) {
        rmSync(tempPath);
      }
    } catch {
      // Ignore cleanup errors
    }
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
