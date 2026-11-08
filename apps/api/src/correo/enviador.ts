import { SendEmailCommand, SESv2Client } from "@aws-sdk/client-sesv2";

export interface Correo {
  para: string;
  asunto: string;
  texto: string;
  html: string;
}

/** Envía un email. Los tests usan uno falso que solo los guarda. */
export interface EnviadorCorreo {
  enviar(correo: Correo): Promise<void>;
}

export interface ConfigSes {
  region: string;
  idClave: string;
  claveSecreta: string;
  remitente: string;
}

/** Amazon SES (spec 008). En modo de pruebas solo envía a direcciones verificadas. */
export function crearEnviadorSes(config: ConfigSes): EnviadorCorreo {
  const cliente = new SESv2Client({
    region: config.region,
    credentials: { accessKeyId: config.idClave, secretAccessKey: config.claveSecreta },
  });
  return {
    async enviar(correo) {
      await cliente.send(
        new SendEmailCommand({
          FromEmailAddress: `Inquilinus <${config.remitente}>`,
          Destination: { ToAddresses: [correo.para] },
          Content: {
            Simple: {
              Subject: { Data: correo.asunto, Charset: "UTF-8" },
              Body: {
                Text: { Data: correo.texto, Charset: "UTF-8" },
                Html: { Data: correo.html, Charset: "UTF-8" },
              },
            },
          },
        }),
      );
    },
  };
}
