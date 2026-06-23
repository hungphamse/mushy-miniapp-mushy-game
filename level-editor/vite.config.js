import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const vercelEnv = process.env.VERCEL_ENV || 'development';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5174,
  },
  define: {
    __VERCEL_ENV__: JSON.stringify(vercelEnv),
  },
});
