// Bucket en memoria para los tests: guarda los objetos en un Map.
import type { Almacen } from "../src/almacen.ts";

export interface AlmacenMemoria extends Almacen {
  objetos: Map<string, Uint8Array>;
  /** Hace lo que haría el navegador con el permiso: dejar el fichero en la clave firmada. */
  subir(campos: Record<string, string>, contenido: Uint8Array): void;
}

export function crearAlmacenMemoria(): AlmacenMemoria {
  const objetos = new Map<string, Uint8Array>();
  return {
    objetos,
    subir(campos, contenido) {
      objetos.set(campos["key"]!, contenido);
    },
    async prepararSubida(clave) {
      return { url: "https://bucket.ejemplo.test/", campos: { key: clave, "Content-Type": "application/pdf" } };
    },
    async leer(clave) {
      return objetos.get(clave) ?? null;
    },
    async copiar(origen, destino) {
      const contenido = objetos.get(origen);
      if (!contenido) throw new Error("NoSuchKey");
      objetos.set(destino, contenido);
    },
    async borrar(claves) {
      for (const clave of claves) objetos.delete(clave);
    },
    async urlDescarga(clave, { segundos }) {
      return `https://bucket.ejemplo.test/${clave}?caduca=${segundos}`;
    },
  };
}
