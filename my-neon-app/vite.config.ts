import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Split heavy deps to keep chunks smaller and quiet the warning.
export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-router')) return 'react';
            if (id.includes('@neondatabase')) return 'neon';
          }
          return undefined;
        },
      },
    },
  },
});
