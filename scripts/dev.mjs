// `pnpm dev`: la web (con la API en /api) en http://localhost:3000, contra la
// base de datos y el bucket de PREVISUALIZACIONES. Lo que crees en local no
// toca los datos reales.
//
// Lee apps/api/.env y usa DATABASE_URL_PREVIEW como DATABASE_URL. Se niega a
// arrancar si esa base es la de producción o si el bucket no es el `-preview`.
// Nunca imprime valores de las variables.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const ficheroEnv = join(raiz, "apps", "api", ".env");
const salir = (mensaje) => {
  console.error(`\n${mensaje}\n`);
  process.exit(1);
};

if (!existsSync(ficheroEnv)) salir("Falta apps/api/.env (copia apps/api/.env.example y rellénalo).");
process.loadEnvFile(ficheroEnv);

const { DATABASE_URL_PREVIEW, DATABASE_URL, APP_S3_BUCKET } = process.env;
if (!DATABASE_URL_PREVIEW) salir("Falta DATABASE_URL_PREVIEW en apps/api/.env.");

const host = (url) => {
  try {
    return new URL(url).host.replace("-pooler", "");
  } catch {
    return null;
  }
};
if (DATABASE_URL && host(DATABASE_URL_PREVIEW) === host(DATABASE_URL)) {
  salir("DATABASE_URL_PREVIEW apunta a la base de producción: no arranco.");
}
if (APP_S3_BUCKET && !APP_S3_BUCKET.endsWith("-preview")) {
  salir("APP_S3_BUCKET no es el bucket de previsualizaciones (-preview): no arranco.");
}

const next = createRequire(join(raiz, "apps", "web", "package.json")).resolve("next/dist/bin/next");
const hijo = spawn(process.execPath, [next, "dev", "--port", "3000", ...process.argv.slice(2)], {
  cwd: join(raiz, "apps", "web"),
  env: {
    ...process.env,
    DATABASE_URL: DATABASE_URL_PREVIEW,
    BETTER_AUTH_URL: "http://localhost:3000",
    NEXT_TELEMETRY_DISABLED: "1",
  },
  stdio: "inherit",
});

console.log("Base de datos y bucket: previsualizaciones. Abre http://localhost:3000");
hijo.on("exit", (codigo) => process.exit(codigo ?? 0));
for (const senal of ["SIGINT", "SIGTERM"]) process.on(senal, () => hijo.kill(senal));
