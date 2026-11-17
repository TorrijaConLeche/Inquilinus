import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Cada fichero arranca su PGlite; con muchos en paralelo, algunos tests
    // pasan de los 5 s por defecto sin que nada vaya mal.
    testTimeout: 20_000,
  },
});
