import {readFile} from 'node:fs/promises';
import {defineConfig} from 'vite';

export default defineConfig({
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
