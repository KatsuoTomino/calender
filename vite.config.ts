import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { localApiPlugin } from './vite-plugin-api';

export default defineConfig({
  server: {
    port: 3000,
    // Ensure /api is handled by localApiPlugin before Vite tries to serve source files
  },
  plugins: [localApiPlugin(), react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    }
  }
});
