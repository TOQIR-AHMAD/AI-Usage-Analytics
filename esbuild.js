const esbuild = require('esbuild');
const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

const ctx = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  format: 'cjs',
  minify: production,
  sourcemap: !production,
  sourcesContent: false,
  platform: 'node',
  target: 'node18',
  outfile: 'dist/extension.js',
  external: ['vscode', 'tiktoken'],
  logLevel: 'info'
};

async function main() {
  if (watch) {
    const context = await esbuild.context(ctx);
    await context.watch();
  } else {
    await esbuild.build(ctx);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
