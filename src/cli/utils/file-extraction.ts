interface HookData {
  tool_input?: {
    file_path?: string;
    command?: string;
  };
  tool_response?: {
    filePath?: string;
    output?: string;
  };
  input?: {
    file_path?: string;
  };
  output?: {
    file_path?: string;
  };
}

export function extractFilePaths(hookData: unknown): string[] {
  const files: string[] = [];
  const data = hookData as HookData;

  // Check single file candidates first
  const candidates = [
    data?.tool_input?.file_path,
    data?.tool_response?.filePath,
    data?.input?.file_path,
    data?.output?.file_path,
  ];

  for (const candidate of candidates) {
    if (candidate && typeof candidate === 'string') {
      if (candidate.match(/\.(ts|tsx|py|go|rs|java|c|cpp|php|swift|kt|scala|tf)$/i)) {
        files.push(candidate);
      }
    }
  }

  // Check tool response output for file paths (e.g., from Bash commands)
  if (data?.tool_response?.output) {
    const output = data.tool_response.output;
    const fileRegex =
      /(?:^|\s|["'])([^\s"']*[/\\]?[^\s"']*\.(?:ts|tsx|py|go|rs|java|c|cpp|php|swift|kt|scala|tf))(?=$|\s|["'])/gim;
    let match;
    while ((match = fileRegex.exec(output)) !== null) {
      files.push(match[1]);
    }
  }

  // Check tool input command for file paths (e.g., Bash commands)
  if (files.length === 0 && data?.tool_input?.command) {
    const command = data.tool_input.command;
    const fileRegex =
      /(?:^|\s|["'])([^\s"']*[/\\]?[^\s"']*\.(?:ts|tsx|py|go|rs|java|c|cpp|php|swift|kt|scala|tf))(?=$|\s|["'])/gim;
    let match;
    while ((match = fileRegex.exec(command)) !== null) {
      files.push(match[1]);
    }
  }

  // Remove duplicates and return
  return Array.from(new Set(files));
}
