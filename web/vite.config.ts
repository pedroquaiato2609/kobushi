import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// No Docker, API_URL aponta para o serviço "api". O navegador só fala com /api (mesma origem).
const target = process.env.API_URL ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  build: {
    sourcemap: false, // não publica o código-fonte original
    target: 'es2020',
    rollupOptions: {
      output: {
        // Separa bibliotecas pesadas do código do app: carrega mais rápido no celular e aproveita cache entre versões.
        manualChunks: { react: ['react', 'react-dom', 'react-router-dom'], charts: ['recharts'], query: ['@tanstack/react-query'] },
      },
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true, // permite acessar por túneis HTTPS (celular/push) — só no servidor de DESENVOLVIMENTO
    // changeOrigin FALSO de propósito: o servidor confere que o Origin do navegador é o mesmo Host (defesa contra CSRF).
    proxy: { '/api': { target, changeOrigin: false } },
  },
});
