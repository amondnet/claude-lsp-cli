import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const CONFIG_PATH = join(homedir(), '.claude', 'lsp-config.json');
const BACKUP_PATH = join(homedir(), '.claude', 'lsp-config.backup.json');

/**
 * Save the current LSP config before running tests
 */
export function saveUserConfig(): void {
  if (existsSync(CONFIG_PATH)) {
    const config = readFileSync(CONFIG_PATH, 'utf8');
    writeFileSync(BACKUP_PATH, config);
  }
}

/**
 * Restore the user's LSP config after tests
 */
export function restoreUserConfig(): void {
  if (existsSync(BACKUP_PATH)) {
    const backup = readFileSync(BACKUP_PATH, 'utf8');
    writeFileSync(CONFIG_PATH, backup);
    // Clean up backup file
    unlinkSync(BACKUP_PATH);
  } else if (existsSync(CONFIG_PATH)) {
    // If no backup but config exists, remove it (tests created it)
    unlinkSync(CONFIG_PATH);
  }
}

/**
 * Enable all languages for testing
 */
export function enableAllLanguages(): void {
  // Clear any disabled languages
  writeFileSync(CONFIG_PATH, JSON.stringify({}, null, 2));
}

/**
 * Setup test environment with all languages enabled
 */
export function setupTestConfig(): void {
  saveUserConfig();
  enableAllLanguages();
}

/**
 * Cleanup test environment and restore user config
 */
export function cleanupTestConfig(): void {
  restoreUserConfig();
}
