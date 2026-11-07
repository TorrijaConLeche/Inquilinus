/** Máximo común divisor y mínimo común múltiplo con enteros grandes. */
export function mcd(a: bigint, b: bigint): bigint {
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

export function mcm(a: bigint, b: bigint): bigint {
  return (a / mcd(a, b)) * b;
}

/**
 * Redondea importes exactos (numerador / denominador, en céntimos) a céntimos enteros
 * por el método del mayor resto, de modo que la suma redondeada sea exactamente la suma exacta.
 * Los empates se resuelven por el orden de los elementos: el caller los ordena según el criterio de la spec.
 */
export function repartirMayorResto(numeradores: readonly bigint[], denominador: bigint): number[] {
  const total = numeradores.reduce((s, n) => s + n, 0n);
  if (total % denominador !== 0n) {
    throw new Error('repartirMayorResto: la suma exacta no es un número entero de céntimos');
  }
  const bases = numeradores.map((n) => n / denominador);
  let sobrantes = total / denominador - bases.reduce((s, b) => s + b, 0n);
  const porResto = numeradores
    .map((n, i) => ({ i, resto: n % denominador }))
    .sort((a, b) => (a.resto === b.resto ? a.i - b.i : a.resto > b.resto ? -1 : 1));
  for (const { i } of porResto) {
    if (sobrantes === 0n) break;
    bases[i]! += 1n;
    sobrantes -= 1n;
  }
  return bases.map(Number);
}
