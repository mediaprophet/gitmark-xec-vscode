
const esbuild = require('esbuild');

const isWatch = process.argv.includes('--watch');

const buildOptions = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'out/extension.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  sourcemap: isWatch,
  minify: !isWatch,
};

async function build() {
  try {
    if (isWatch) {
      const ctx = await esbuild.context(buildOptions);
      await ctx.watch();
      console.log('Watch mode started...');
    } else {
      await esbuild.build(buildOptions);
      console.log('Build complete.');
    }
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

build();
