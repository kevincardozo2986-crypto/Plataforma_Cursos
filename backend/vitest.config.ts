import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  // Resolves the path aliases declared in tsconfig.json, including the ones
  // added by `nest g library`.
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.spec.ts'],
    // Algunas pruebas hacen trabajo pesado de verdad (cifrar con bcrypt, procesar una imagen
    // de 3000x2000 con sharp). Con el equipo ocupado pasan de los 5 s por defecto sin estar mal.
    testTimeout: 20_000,
  },
});
