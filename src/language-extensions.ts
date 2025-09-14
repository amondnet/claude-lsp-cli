/**
 * Centralized language extension mapping
 * Single source of truth for supported file extensions and their languages
 */

export const LANGUAGE_EXTENSIONS = {
  // TypeScript
  typescript: ['.ts', '.tsx', '.mts', '.cts'],

  // Python
  python: ['.py', '.pyi'],

  // Go
  go: ['.go'],

  // Rust
  rust: ['.rs'],

  // Java
  java: ['.java'],

  // C/C++
  cpp: ['.cpp', '.cxx', '.cc', '.c', '.h', '.hpp'],

  // PHP
  php: ['.php'],

  // Scala
  scala: ['.scala'],

  // Lua
  lua: ['.lua'],

  // Elixir
  elixir: ['.ex', '.exs'],

  // Terraform
  terraform: ['.tf'],
} as const;

// Create reverse mapping: extension -> language
export const EXTENSION_TO_LANGUAGE = new Map<string, keyof typeof LANGUAGE_EXTENSIONS>();

for (const [language, extensions] of Object.entries(LANGUAGE_EXTENSIONS)) {
  for (const ext of extensions) {
    EXTENSION_TO_LANGUAGE.set(ext, language as keyof typeof LANGUAGE_EXTENSIONS);
  }
}

// Get all supported extensions as a flat array
export const ALL_SUPPORTED_EXTENSIONS = Object.values(LANGUAGE_EXTENSIONS).flat();

/**
 * Get language for a file extension
 * @param extension - File extension with dot (e.g., '.ts')
 * @returns Language name or null if not supported
 */
export function getLanguageForExtension(
  extension: string
): keyof typeof LANGUAGE_EXTENSIONS | null {
  return EXTENSION_TO_LANGUAGE.get(extension.toLowerCase()) || null;
}

/**
 * Check if a file extension is supported
 * @param extension - File extension with dot (e.g., '.ts')
 * @returns True if the extension is supported
 */
export function isExtensionSupported(extension: string): boolean {
  return EXTENSION_TO_LANGUAGE.has(extension.toLowerCase());
}

/**
 * Get all extensions for a specific language
 * @param language - Language name
 * @returns Array of extensions or empty array
 */
export function getExtensionsForLanguage(
  language: keyof typeof LANGUAGE_EXTENSIONS
): readonly string[] {
  return LANGUAGE_EXTENSIONS[language] || [];
}
