// Escribe dist/openapi.json para herramientas externas (clientes, documentación).
import { mkdirSync, writeFileSync } from 'node:fs';
import { generarOpenApi } from '../src/index.ts';

const destino = new URL('../dist/openapi.json', import.meta.url);
mkdirSync(new URL('.', destino), { recursive: true });
writeFileSync(destino, `${JSON.stringify(generarOpenApi(), null, 2)}\n`);
console.log(`OpenAPI escrito en ${destino.pathname}`);
