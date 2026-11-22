import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const root = path.dirname(fileURLToPath(import.meta.url));
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      { find: /(?:^|\/)context\/AuthContext(?:\.tsx)?$/, replacement: path.resolve(root, 'tests/visual/mock-auth.ts') },
      { find: /(?:^|\/)services\/api(?:\.ts)?$/, replacement: path.resolve(root, 'tests/visual/mock-api.ts') },
      { find: /(?:^|\/)hooks\/useApi(?:\.ts)?$/, replacement: path.resolve(root, 'tests/visual/mock-use-api.ts') },
      { find: '@', replacement: root }
    ]
  },
  server: { host: '127.0.0.1', port: 4173, strictPort: true }
});
