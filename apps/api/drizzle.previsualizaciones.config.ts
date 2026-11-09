import { defineConfig } from "drizzle-kit";
import base from "./drizzle.config.ts";

// Migraciones de la base de datos de las previsualizaciones de Vercel (rama
// de Neon aparte, tarea 3.0): `pnpm bd:migrar:previsualizaciones`.
const url = process.env["DATABASE_URL_PREVIEW_DIRECTA"] ?? process.env["DATABASE_URL_PREVIEW"] ?? "";
const produccion = process.env["DATABASE_URL_DIRECTA"] ?? process.env["DATABASE_URL"] ?? "";

const host = (u: string) => {
  try {
    return new URL(u).host;
  } catch {
    return "";
  }
};
if (!url) throw new Error("Falta DATABASE_URL_PREVIEW_DIRECTA en apps/api/.env");
// Nunca se migra producción por error con este comando.
if (host(url) === host(produccion)) throw new Error("La base de previsualizaciones coincide con la de producción");

export default defineConfig({ ...base, dbCredentials: { url } });
