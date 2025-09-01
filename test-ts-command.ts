#!/usr/bin/env bun

import { languageServers } from './src/language-servers';

const config = languageServers.typescript;
console.log('TypeScript config:', config);
console.log('\nCommand:', config.command);
console.log('Args:', config.args);