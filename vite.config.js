import {readFile} from 'node:fs/promises';
import {defineConfig} from 'vite';

export default defineConfig({
  server: {
    proxy: {
      '/ws': {target: 'ws://127.0.0.1:8090', ws: true},
    },
  },
  preview: {
    proxy: {
      '/ws': {target: 'ws://127.0.0.1:8090', ws: true},
    },
  },
  plugins: [{
    name: 'include-license-notices',
    apply: 'build',
    async generateBundle() {
      for (const fileName of ['LICENSE', 'THIRD_PARTY_NOTICES.md']) {
        this.emitFile({
          type: 'asset',
          fileName,
          source: await readFile(new URL(fileName, import.meta.url), 'utf8'),
        });
      }
    },
  }],
});
