import { handleUserCommand } from '../commands/user-command';

export async function handleUserPromptSubmit(input: string): Promise<void> {
  try {
    if (!input.trim()) {
      process.exit(0);
    }

    let hookData: unknown;
    try {
      hookData = JSON.parse(input);
    } catch {
      process.exit(0);
    }

    const prompt = (hookData as { prompt?: string }).prompt || '';

    // Use the shared command handler
    const result = await handleUserCommand(prompt);

    if (result !== null) {
      // Display result to user via stderr and cancel the prompt
      console.error(result);
      process.exit(2);
    }

    // If no >lsp command, pass through unchanged
    console.log(JSON.stringify(hookData));
    process.exit(0);
  } catch {
    process.exit(1);
  }
}
