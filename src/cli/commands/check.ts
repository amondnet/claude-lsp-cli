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
    // Use formatDiagnostics for both cases (with errors and without)
    const formatted = formatDiagnostics(result, true); // showNoErrors=true
    if (formatted) {
      log(formatted);
    }
  } else {
    // File type not supported - also exit silently
    return;
  }
}
