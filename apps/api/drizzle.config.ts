import { defineConfig } from "drizzle-kit";

// Lee apps/api/.env si existe (nunca se sube al repositorio).
try {
  process.loadEnvFile();
} catch {}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/bd/esquema.ts",
  out: "./drizzle",
  casing: "snake_case",
  // Para migrar se usa la conexión directa (sin pooler) si la hay.
  dbCredentials: {
    url: process.env["DATABASE_URL_DIRECTA"] ?? process.env["DATABASE_URL"] ?? "",
  },
});
