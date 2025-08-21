process.argv = ['node', 'typescript-language-server', '--stdio'];
await import('typescript-language-server/lib/cli.mjs');
