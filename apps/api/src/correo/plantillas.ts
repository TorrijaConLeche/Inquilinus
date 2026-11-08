import type { Idioma } from "@inquilinus/contracts";

// Textos de los emails de la cuenta (spec 008). Como en la web, en es y en.

type Plantilla = "verificarEmail" | "recuperarContrasena";

const TEXTOS: Record<Idioma, Record<Plantilla, { asunto: string; intro: string; boton: string; pie: string }>> = {
  es: {
    verificarEmail: {
      asunto: "Confirma tu email en Inquilinus",
      intro: "Para empezar a usar tu cuenta, confirma que este email es tuyo.",
      boton: "Confirmar email",
      pie: "Si no has creado una cuenta en Inquilinus, ignora este mensaje.",
    },
    recuperarContrasena: {
      asunto: "Cambia tu contraseña de Inquilinus",
      intro: "Has pedido cambiar tu contraseña. El enlace sirve una sola vez y caduca en 1 hora.",
      boton: "Cambiar contraseña",
      pie: "Si no lo has pedido tú, ignora este mensaje: tu contraseña no cambia.",
    },
  },
  en: {
    verificarEmail: {
      asunto: "Confirm your email for Inquilinus",
      intro: "To start using your account, please confirm this email is yours.",
      boton: "Confirm email",
      pie: "If you didn't create an Inquilinus account, you can ignore this message.",
    },
    recuperarContrasena: {
      asunto: "Change your Inquilinus password",
      intro: "You asked to change your password. The link works once and expires in 1 hour.",
      boton: "Change password",
      pie: "If you didn't ask for this, ignore this message: your password stays the same.",
    },
  },
};

const escaparHtml = (texto: string) =>
  texto.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function componerCorreo(plantilla: Plantilla, idioma: Idioma, para: string, url: string) {
  const t = TEXTOS[idioma][plantilla];
  const enlace = escaparHtml(url);
  return {
    para,
    asunto: t.asunto,
    texto: `${t.intro}\n\n${t.boton}: ${url}\n\n${t.pie}\n`,
    html: `<!doctype html><html lang="${idioma}"><body style="font-family:system-ui,sans-serif;color:#1f2a27;line-height:1.5">
<p>${escaparHtml(t.intro)}</p>
<p><a href="${enlace}" style="display:inline-block;padding:10px 16px;border-radius:8px;background:#2f7d6b;color:#ffffff;text-decoration:none;font-weight:600">${escaparHtml(t.boton)}</a></p>
<p style="color:#5e6b67;font-size:14px">${escaparHtml(t.pie)}</p>
</body></html>`,
  };
}
