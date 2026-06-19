import { defineConfig } from 'tsup';
import { readFile, writeFile } from 'node:fs/promises';

// esbuild strips module-level "use client" directives when bundling, so we
// prepend it to the built bundles afterwards — this marks the package as a
// React Client Component for RSC consumers (Next.js App Router).
const OUTPUTS = ['dist/index.js', 'dist/index.cjs'];

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  treeshake: true,
  sourcemap: true,
  minify: false,
  // React is a peer dependency — never bundle it. The shared TypeScript core
  // (src/core) and the 22 locale JSONs ARE bundled so local mode needs zero
  // network.
  external: ['react', 'react-dom'],
  outExtension({ format }) {
    return { js: format === 'cjs' ? '.cjs' : '.js' };
  },
  async onSuccess() {
    await Promise.all(
      OUTPUTS.map(async (file) => {
        const code = await readFile(file, 'utf8');
        if (!code.startsWith('"use client"')) {
          await writeFile(file, `"use client";\n${code}`);
        }
      })
    );
  },
});
