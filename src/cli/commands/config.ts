import { join, dirname } from "path";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { showStatus } from "./help";

export function loadConfig(): any {
  const homeDir = process.env.HOME || process.env.USERPROFILE || "";
  const configPath = join(homeDir, ".claude", "lsp-config.json");
  let config: any = {};
  if (existsSync(configPath)) {
    config = JSON.parse(readFileSync(configPath, "utf8"));
  }
  return config;
}

function updateConfig(updates: Record<string, any>): void {
  const homeDir = process.env.HOME || process.env.USERPROFILE || "";
  const configPath = join(homeDir, ".claude", "lsp-config.json");
  let config: any = {};
  
  // Read existing config
  try {
    if (existsSync(configPath)) {
      config = JSON.parse(readFileSync(configPath, "utf8"));
    }
  } catch (e) {
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
}

export async function disableLanguage(language: string): Promise<string> {
  // Normalize language names to match what the checker expects
  const langMap: Record<string, string> = {
    'typescript': 'TypeScript',
    'python': 'Python',
    'go': 'Go',
    'rust': 'Rust',
    'java': 'Java',
    'cpp': 'Cpp',
    'c++': 'Cpp',
    'c': 'Cpp',
    'php': 'Php',
    'scala': 'Scala',
    'lua': 'Lua',
    'elixir': 'Elixir',
    'terraform': 'Terraform',
    'all': 'all'
  };
  
  const normalizedLang = langMap[language.toLowerCase()] || language;
  
  let messages: string[] = [];
  
  if (normalizedLang === 'all') {
    updateConfig({ disable: true });
    messages.push(`🚫 Disabled ALL language checking globally`);
  } else if (language.toLowerCase() in langMap) {
    const langKey = `disable${normalizedLang}`;
    updateConfig({ [langKey]: true });
    messages.push(`🚫 Disabled ${language} checking globally`);
  }
  
  // Get status and return combined message
  const status = await showStatus(null);
  return messages.join('\n') + '\n' + status;
}

export async function enableLanguage(language: string): Promise<string> {
  // Normalize language names to match what the checker expects
  const langMap: Record<string, string> = {
    'typescript': 'TypeScript',
    'python': 'Python',
    'go': 'Go',
    'rust': 'Rust',
    'java': 'Java',
    'cpp': 'Cpp',
    'c++': 'Cpp',
    'c': 'Cpp',
    'php': 'Php',
    'scala': 'Scala',
    'lua': 'Lua',
    'elixir': 'Elixir',
    'terraform': 'Terraform',
    'all': 'all'
  };
  
  const normalizedLang = langMap[language.toLowerCase()] || language;
  
  let messages: string[] = [];
  
  if (normalizedLang === 'all') {
    updateConfig({ disable: false });
    messages.push(`✅ Enabled ALL language checking globally`);
  } else if (language.toLowerCase() in langMap) {
    const langKey = `disable${normalizedLang}`;
    updateConfig({ [langKey]: false });
    messages.push(`✅ Enabled ${language} checking globally`);
  }
  
  // Get status and return combined message
  const status = await showStatus(null);
  return messages.join('\n') + '\n' + status;
}