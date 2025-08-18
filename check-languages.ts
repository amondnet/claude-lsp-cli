#!/usr/bin/env bun

import { languageServers, isLanguageServerInstalled } from "./src/language-servers";

console.log("Language Server Installation Status:");
console.log("====================================\n");

let installed = 0;
let notInstalled = 0;

for (const [lang, config] of Object.entries(languageServers)) {
  const isInstalled = isLanguageServerInstalled(lang);
  console.log(`${isInstalled ? "✅" : "❌"} ${config.name.padEnd(25)} (${lang})`);
  if (isInstalled) installed++;
  else notInstalled++;
}

console.log("\n====================================");
console.log(`Total: ${installed + notInstalled} languages`);
console.log(`Installed: ${installed}`);
console.log(`Not Installed: ${notInstalled}`);