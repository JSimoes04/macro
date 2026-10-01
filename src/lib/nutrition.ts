export interface Nutrients {
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
  fiber?: number;
  sugar?: number;
  satFat?: number;
  salt?: number;
}

export type MacroKey = 'protein' | 'fat' | 'carbs';
export type ExtraKey = 'fiber' | 'sugar' | 'satFat' | 'salt';

/** Ordem fixa usada em toda a app (como no MacroFactor: P · G · H). */
export const MACROS: { key: MacroKey; label: string; short: string; kcalPerGram: number }[] = [
  { key: 'protein', label: 'Proteína', short: 'P', kcalPerGram: 4 },
  { key: 'fat', label: 'Gordura', short: 'G', kcalPerGram: 9 },
  { key: 'carbs', label: 'Hidratos', short: 'H', kcalPerGram: 4 },
];

export const EXTRAS: { key: ExtraKey; label: string }[] = [
  { key: 'sugar', label: 'Açúcares' },
  { key: 'fiber', label: 'Fibra' },
  { key: 'satFat', label: 'Gordura saturada' },
  { key: 'salt', label: 'Sal' },
];

export const ZERO: Nutrients = { kcal: 0, protein: 0, fat: 0, carbs: 0 };

/** Nutrientes de `amount` g/ml a partir dos valores por 100 g/ml. */
export function scaleNutrients(per100: Nutrients, amount: number): Nutrients {
  const f = amount / 100;
  const out: Nutrients = {
    kcal: per100.kcal * f,
    protein: per100.protein * f,
    fat: per100.fat * f,
    carbs: per100.carbs * f,
  };
  for (const { key } of EXTRAS) {
    const v = per100[key];
    if (v != null) out[key] = v * f;
  }
  return out;
}

export function sumNutrients(list: Nutrients[]): Nutrients {
  const out: Nutrients = { ...ZERO };
  for (const n of list) {
    out.kcal += n.kcal;
    out.protein += n.protein;
    out.fat += n.fat;
    out.carbs += n.carbs;
  }
  return out;
}

export function kcalFromMacros(n: Pick<Nutrients, MacroKey>): number {
  return n.protein * 4 + n.fat * 9 + n.carbs * 4;
}

/** Aceita "1,5" e "1.5" (o teclado do iPhone em pt-PT usa vírgula). */
export function parseDecimal(input: string): number | undefined {
  const s = input.trim().replace(/\s/g, '').replace(',', '.');
  if (s === '' || !/^\d*\.?\d*$/.test(s) || s === '.') return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

/** Valor para preencher um campo de texto (com vírgula decimal). */
export function toInputValue(n: number | undefined, decimals = 1): string {
  if (n == null || !Number.isFinite(n)) return '';
  const f = 10 ** decimals;
  return String(Math.round(n * f) / f).replace('.', ',');
}

const intFmt = new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 0 });
const oneDecFmt = new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 1 });
const twoDecFmt = new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 2 });

export function fmtKcal(n: number): string {
  return intFmt.format(Math.round(n));
}

/** Gramas: uma casa decimal abaixo de 10 g, inteiro acima. */
export function fmtGrams(n: number): string {
  return Math.abs(n) < 10 ? oneDecFmt.format(n) : intFmt.format(n);
}

export function fmtAmount(n: number): string {
  return Math.abs(n) < 10 ? twoDecFmt.format(n) : oneDecFmt.format(n);
}

export function fmtNumber(n: number, decimals = 1): string {
  return new Intl.NumberFormat('pt-PT', { maximumFractionDigits: decimals }).format(n);
}
