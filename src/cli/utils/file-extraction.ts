export function extractFilePaths(hookData: any): string[] {
  const files: string[] = [];

  // Check single file candidates first
  const candidates = [
    hookData?.tool_input?.file_path,
    hookData?.tool_response?.filePath,
    hookData?.input?.file_path,
    hookData?.output?.file_path,
  ];

  for (const candidate of candidates) {
    if (candidate && typeof candidate === 'string') {
      if (candidate.match(/\.(ts|tsx|py|go|rs|java|c|cpp|php|swift|kt|scala|tf)$/i)) {
        files.push(candidate);
      }
    }
  }

  // Check tool response output for file paths (e.g., from Bash commands)
  if (hookData?.tool_response?.output) {
    const output = hookData.tool_response.output;
    const fileRegex =
      /(?:^|\s|["'])([^\s"']*[\/\\]?[^\s"']*\.(?:ts|tsx|py|go|rs|java|c|cpp|php|swift|kt|scala|tf))(?=$|\s|["'])/gim;
    let match;
    while ((match = fileRegex.exec(output)) !== null) {
      files.push(match[1]);
    }
  }

  // Check tool input command for file paths (e.g., Bash commands)
  if (files.length === 0 && hookData?.tool_input?.command) {
    const command = hookData.tool_input.command;
    const fileRegex =
      /(?:^|\s|["'])([^\s"']*[\/\\]?[^\s"']*\.(?:ts|tsx|py|go|rs|java|c|cpp|php|swift|kt|scala|tf))(?=$|\s|["'])/gim;
    let match;
    while ((match = fileRegex.exec(command)) !== null) {
      files.push(match[1]);
    }
  }

  // Remove duplicates and return
  return Array.from(new Set(files));
}
