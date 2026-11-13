/** Error de la API con su código, para responder 400 sin pasar por el dominio. */
export class ErrorPeticion extends Error {
  readonly codigo: string;

  constructor(codigo: string) {
    super(codigo);
    this.name = "ErrorPeticion";
    this.codigo = codigo;
  }
}
