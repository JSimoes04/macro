/** A marca só se mostra quando acrescenta informação ("Nutella · Nutella" não). */
export function displayBrand(name: string, brand?: string): string | undefined {
  if (!brand?.trim()) return undefined;
  return brand.trim().toLowerCase() === name.trim().toLowerCase() ? undefined : brand.trim();
}
