import { resolve } from 'path';
import { existsSync } from 'fs';
import { checkFile, formatDiagnostics } from '../../file-checker';

export async function runCheck(
  filePath: string,
  log: (..._args: unknown[]) => unknown = console.log
): Promise<void> {
  if (!filePath) {
    return;
  }

  const absolutePath = resolve(filePath);

  if (!existsSync(absolutePath)) {
    return;
  }

  const result = await checkFile(absolutePath);
  if (result === null) {
    // Checking was disabled - exit silently with no output
    return;
  } else if (result) {
    if (result.diagnostics.length > 0) {
      const formatted = formatDiagnostics(result);
      if (formatted) {
        log(formatted);
      }
    } else {
      // Only say "no errors or warnings" if we actually checked the file
      log('[[system-message]]:{"summary":"no errors or warnings"}');
    }
  } else {
    // File type not supported - also exit silently
    return;
  }
}
