import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/**/*.test.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.js'],
      exclude: ['src/config/**'],
    },
    // Los tests de integración pegan contra la base de datos real definida
    // en .env (o en las variables de entorno del contenedor de test) —
    // por eso corren en serie, no en paralelo, para evitar condiciones de
    // carrera sobre las mismas tablas.
    fileParallelism: false,
  },
});
