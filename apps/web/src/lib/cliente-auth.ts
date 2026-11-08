"use client";
// Cliente de Better Auth para el navegador (spec 008). Habla con /api/auth.
import { inferAdditionalFields, twoFactorClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const clienteAuth = createAuthClient({
  basePath: "/api/auth",
  plugins: [
    twoFactorClient(),
    // Campo extra del registro (R4): versión de los términos aceptada.
    inferAdditionalFields({ user: { terminosVersion: { type: "string", required: false } } }),
  ],
});
