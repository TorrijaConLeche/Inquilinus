// Spec 008, R1b: registro por invitación durante la beta cerrada.
// La lista sale de REGISTRO_INVITADOS: emails separados por comas, sin
// distinguir mayúsculas ni espacios. Con "*", el registro es libre; sin la
// variable o vacía, nadie se registra (si se olvida, la puerta queda cerrada).
// La lista nunca va a los logs: son datos personales.

export interface ListaInvitados {
  /** ¿Puede crear una cuenta nueva este email? */
  permite(email: string): boolean;
}

const normalizar = (email: string) => email.trim().toLowerCase();

export function listaInvitados(texto: string | undefined): ListaInvitados {
  const entradas = (texto ?? "").split(",").map(normalizar).filter(Boolean);
  if (entradas.includes("*")) return { permite: () => true };
  const emails = new Set(entradas);
  return { permite: (email) => emails.has(normalizar(email)) };
}
