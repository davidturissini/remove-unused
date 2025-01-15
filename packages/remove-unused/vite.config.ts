import { defineConfig } from 'vite';
import { nodeExternals } from 'rollup-plugin-node-externals';

export default defineConfig({
  plugins: [nodeExternals()],
  build: {
    lib: {
      entry: 'src/main.ts',
      formats: ['es'],
      fileName: 'remove-unused',
    },
    outDir: 'dist/es',
  },
});
