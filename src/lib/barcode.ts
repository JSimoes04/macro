/**
 * Normaliza um código EAN/UPC. Um UPC-A (12 dígitos) é guardado na forma EAN-13
 * (com um 0 à frente), que é como o Open Food Facts o identifica.
 */
export function normalizeBarcode(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  return digits.length === 12 ? `0${digits}` : digits;
}

/** Formas equivalentes do mesmo código, para encontrar alimentos já guardados. */
export function barcodeVariants(raw: string): string[] {
  const code = normalizeBarcode(raw);
  const variants = new Set([code]);
  if (code.length === 13 && code.startsWith('0')) variants.add(code.slice(1));
  return [...variants];
}

/** Valida o dígito de controlo de EAN-8, UPC-A, EAN-13 e GTIN-14. */
export function isValidGtin(raw: string): boolean {
  const code = raw.replace(/\D/g, '');
  if (![8, 12, 13, 14].includes(code.length)) return false;
  const digits = code.split('').map(Number);
  const check = digits.pop()!;
  const sum = digits
    .reverse()
    .reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}
