// Almacenamiento de ficheros en el bucket privado (spec 007, R6b y R6c).
// La API solo maneja claves; el navegador sube y descarga directamente del
// bucket con permisos firmados de corta duración.
import {
  CopyObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  NoSuchKey,
  S3Client,
} from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export interface PermisoSubida {
  /** Dirección a la que el navegador manda el formulario (POST multipart). */
  url: string;
  /** Campos que van en el formulario antes del fichero. */
  campos: Record<string, string>;
}

export interface Almacen {
  /** Permiso para subir un PDF a `clave`, de hasta `tamanoMaximo` bytes, válido `segundos`. */
  prepararSubida(clave: string, opciones: { tamanoMaximo: number; segundos: number }): Promise<PermisoSubida>;
  /** Contenido del objeto, o null si no existe. */
  leer(clave: string): Promise<Uint8Array | null>;
  /** Copia dentro del bucket, sin pasar el contenido por la API. */
  copiar(origen: string, destino: string): Promise<void>;
  borrar(claves: string[]): Promise<void>;
  /** URL firmada para ver el PDF, válida `segundos`. */
  urlDescarga(clave: string, opciones: { nombre: string; segundos: number }): Promise<string>;
}

/** Prefijo de lo subido y aún no confirmado: una regla del bucket lo borra al día siguiente (R6c). */
export const PREFIJO_PENDIENTES = "pendientes/";

export const clavePendiente = (usuarioId: string, subidaId: string) => `${PREFIJO_PENDIENTES}${usuarioId}/${subidaId}.pdf`;
export const claveDocumento = (usuarioId: string, ficheroId: string) => `documentos/${usuarioId}/${ficheroId}.pdf`;

/**
 * Cabecera para ver el PDF en el navegador con su nombre original. El nombre
 * va codificado (RFC 6266/5987); la versión sin codificar solo lleva ASCII seguro.
 */
export function disposicion(nombre: string): string {
  const ascii = nombre.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nombre)}`;
}

/**
 * El usuario de la app no tiene permiso para listar el bucket (mínimo
 * privilegio), así que S3 responde 403 AccessDenied, y no 404, cuando el
 * objeto no existe. Las claves las construye siempre la API, así que un 403
 * al leer solo puede ser eso.
 */
export function noExiste(error: unknown): boolean {
  if (error instanceof NoSuchKey) return true;
  const { name, $metadata } = (error ?? {}) as { name?: string; $metadata?: { httpStatusCode?: number } };
  return name === "NoSuchKey" || (name === "AccessDenied" && $metadata?.httpStatusCode === 403);
}

export function crearAlmacenS3(config: {

  region: string;
  idClave: string;
  claveSecreta: string;
  bucket: string;
}): Almacen {
  const cliente = new S3Client({
    region: config.region,
    credentials: { accessKeyId: config.idClave, secretAccessKey: config.claveSecreta },
  });
  const Bucket = config.bucket;

  return {
    async prepararSubida(clave, { tamanoMaximo, segundos }) {
      const { url, fields } = await createPresignedPost(cliente, {
        Bucket,
        Key: clave,
        Expires: segundos,
        Fields: { "Content-Type": "application/pdf" },
        Conditions: [
          ["content-length-range", 1, tamanoMaximo],
          ["eq", "$Content-Type", "application/pdf"],
        ],
      });
      return { url, campos: fields };
    },

    async leer(clave) {
      try {
        const respuesta = await cliente.send(new GetObjectCommand({ Bucket, Key: clave }));
        return respuesta.Body ? await respuesta.Body.transformToByteArray() : new Uint8Array();
      } catch (error) {
        if (noExiste(error)) return null;
        throw error;
      }
    },

    async copiar(origen, destino) {
      await cliente.send(new CopyObjectCommand({ Bucket, CopySource: `${Bucket}/${origen}`, Key: destino }));
    },

    async borrar(claves) {
      // DeleteObjects admite hasta 1000 claves por llamada.
      for (let i = 0; i < claves.length; i += 1000) {
        const lote = claves.slice(i, i + 1000);
        const respuesta = await cliente.send(
          new DeleteObjectsCommand({ Bucket, Delete: { Objects: lote.map((Key) => ({ Key })), Quiet: true } }),
        );
        if (respuesta.Errors?.length) throw new Error(`BORRADO_INCOMPLETO_${respuesta.Errors[0]?.Code ?? "S3"}`);
      }
    },

    async urlDescarga(clave, { nombre, segundos }) {
      return getSignedUrl(
        cliente,
        new GetObjectCommand({
          Bucket,
          Key: clave,
          ResponseContentType: "application/pdf",
          ResponseContentDisposition: disposicion(nombre),
          ResponseCacheControl: "private, no-store",
        }),
        { expiresIn: segundos },
      );
    },
  };
}
