import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// vite.config.js
//
// El build de producción genera frontend/dist/, que es lo que copia
// frontend/Dockerfile a la imagen de nginx (ver nginx/nginx.conf y
// nginx/nginx.prod.conf — ya no sirven frontend/src/ directamente).
//
// El proxy de /api solo aplica a `npm run dev` (servidor de Vite fuera
// de Docker, para desarrollo con hot-reload) — apunta al backend
// expuesto en el host por docker-compose.yml (puerto 3000). En
// contenedores, nginx sigue siendo el único proxy hacia /api.
//
// El alias "@" -> src/ es la convención de shadcn/ui (components.json
// lo referencia igual) — así los componentes de src/components/ui/ se
// importan como "@/components/ui/button" sin rutas relativas frágiles.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
  },
});
