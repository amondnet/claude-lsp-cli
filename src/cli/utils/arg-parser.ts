import minimist from "minimist";
import { globalSettings } from "./global-settings";

export interface ParsedArgs {
  command?: string;
  args: string[];
  globalFlags: {
    port?: number;
    browser?: string;
  };
}

export function parseArguments(argv: string[]): ParsedArgs {
  // Parse with minimist
  const parsed = minimist(argv, {
    alias: {
      p: 'port',
      b: 'browser',
      h: 'help'
    },
    string: ['browser'],
    boolean: ['help'],
    default: {
      port: process.env.PORT ? parseInt(process.env.PORT, 10) : undefined,
      browser: process.env.BROWSER
    },
    stopEarly: false,
    '--': true
  });
  
  // Update global settings if provided
  if (parsed.port && !isNaN(parsed.port)) {
    globalSettings.port = parsed.port;
  }
  if (parsed.browser) {
    globalSettings.browser = parsed.browser;
  }
  
  // Extract command and args
  const result: ParsedArgs = {
    command: parsed._[0],
    args: parsed._.slice(1),
    globalFlags: {
      port: parsed.port,
      browser: parsed.browser
    }
  };
  
  return result;
}