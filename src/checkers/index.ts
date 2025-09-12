/**
 * Language Checker Registry Initialization
 * 
 * This file registers all language configurations with the registry
 */

import { registerLanguage } from '../language-checker-registry.js';
import { typescriptConfig } from './typescript.js';
import { pythonConfig } from './python.js';
import { goConfig } from './go.js';
import { rustConfig } from './rust.js';
import { javaConfig } from './java.js';
import { cppConfig } from './cpp.js';
import { phpConfig } from './php.js';
import { scalaConfig } from './scala.js';
import { luaConfig } from './lua.js';
import { elixirConfig } from './elixir.js';
import { terraformConfig } from './terraform.js';

// Register all language configurations
registerLanguage(typescriptConfig.extensions, typescriptConfig);
registerLanguage(pythonConfig.extensions, pythonConfig);
registerLanguage(goConfig.extensions, goConfig);
registerLanguage(rustConfig.extensions, rustConfig);
registerLanguage(javaConfig.extensions, javaConfig);
registerLanguage(cppConfig.extensions, cppConfig);
registerLanguage(phpConfig.extensions, phpConfig);
registerLanguage(scalaConfig.extensions, scalaConfig);
registerLanguage(luaConfig.extensions, luaConfig);
registerLanguage(elixirConfig.extensions, elixirConfig);
registerLanguage(terraformConfig.extensions, terraformConfig);

// Export registry for use in file-checker
export { LANGUAGE_REGISTRY } from '../language-checker-registry.js';