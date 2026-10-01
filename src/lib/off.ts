import type { FoodData, Unit } from '../db';
import { normalizeBarcode } from './barcode';
import type { ExtraKey, Nutrients } from './nutrition';

/**
 * Open Food Facts: base de dados aberta e gratuita de produtos alimentares
 * (https://world.openfoodfacts.org, licença ODbL). Não precisa de chave e
 * permite pedidos diretos do browser (CORS).
 */
const PRODUCT_API = 'https://world.openfoodfacts.org/api/v2/product/';

/** Campos com o nome do produto em cada língua (`lang` é a língua principal da embalagem). */
const NAME_FIELDS = [
  'lang',
  'product_name',
  'product_name_pt',
  'product_name_en',
  'generic_name',
  'generic_name_pt',
  'generic_name_en',
];

const FIELDS = [
  ...NAME_FIELDS,
  'code',
  'brands',
  'product_quantity',
  'product_quantity_unit',
  'serving_size',
  'serving_quantity',
  'serving_quantity_unit',
  'nutriments',
  'image_front_small_url',
  'image_small_url',
  'image_front_url',
  'image_url',
].join(',');

const TIMEOUT_MS = 15_000;

export class OffError extends Error {}

/**
 * Versão das regras de escolha do nome. Os alimentos guardados com uma versão
 * anterior (e nunca editados) voltam a receber o nome do Open Food Facts.
 */
export const NAME_RULES_VERSION = 2;

/** Procura um produto pelo código de barras. Devolve `null` se não existir. */
export async function fetchProduct(rawCode: string, signal?: AbortSignal): Promise<FoodData | null> {
  const code = normalizeBarcode(rawCode);
  const product = await requestProduct(code, FIELDS, signal);
  return product ? normalizeProduct(product, code) : null;
}

/** Só o nome do produto, com a ordem de línguas atual. */
export async function fetchProductName(rawCode: string, signal?: AbortSignal): Promise<string | undefined> {
  const product = await requestProduct(normalizeBarcode(rawCode), NAME_FIELDS.join(','), signal);
  return product ? productName(product) : undefined;
}

async function requestProduct(
  code: string,
  fields: string,
  signal?: AbortSignal,
): Promise<Record<string, unknown> | null> {
  signal?.throwIfAborted();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new OffError('O Open Food Facts demorou demasiado a responder.')), TIMEOUT_MS);
  const forwardAbort = () => ctrl.abort(signal?.reason);
  signal?.addEventListener('abort', forwardAbort, { once: true });
  try {
    const res = await fetch(`${PRODUCT_API}${encodeURIComponent(code)}.json?fields=${fields}`, {
      signal: ctrl.signal,
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new OffError(`O Open Food Facts respondeu com o erro ${res.status}.`);
    const data = (await res.json()) as { status?: number; product?: Record<string, unknown> };
    if (data.status !== 1 || !data.product) return null;
    return data.product;
  } catch (err) {
    if (ctrl.signal.aborted && ctrl.signal.reason instanceof OffError) throw ctrl.signal.reason;
    throw err;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', forwardAbort);
  }
}

function num(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.trim().replace(',', '.'));
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function str(v: unknown): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return typeof s === 'string' && s.trim() !== '' ? s.trim() : undefined;
}

/**
 * Nome pela ordem de preferência: português, depois inglês e, só se não houver
 * nenhum dos dois, o nome na língua original da embalagem (ex.: francês).
 * O Open Food Facts não distingue português de Portugal e do Brasil.
 */
export function productName(p: Record<string, unknown>): string | undefined {
  const lang = str(p.lang);
  const inLanguage = (field: 'product_name' | 'generic_name', lc: string) =>
    str(p[`${field}_${lc}`]) ?? (lang === lc ? str(p[field]) : undefined);
  return (
    inLanguage('product_name', 'pt') ??
    inLanguage('product_name', 'en') ??
    inLanguage('generic_name', 'pt') ??
    inLanguage('generic_name', 'en') ??
    str(p.product_name) ??
    str(p.generic_name)
  );
}

const EXTRA_FIELDS: [ExtraKey, string][] = [
  ['sugar', 'sugars'],
  ['fiber', 'fiber'],
  ['satFat', 'saturated-fat'],
  ['salt', 'salt'],
];

/** Converte a resposta do Open Food Facts para o formato da app (valores por 100 g/ml). */
export function normalizeProduct(p: Record<string, unknown>, code: string): FoodData {
  const n = (p.nutriments ?? {}) as Record<string, unknown>;
  const servingQty = num(p.serving_quantity);

  // Alguns produtos só têm valores por porção: converte-se para 100 g.
  const per100 = (key: string): number | undefined => {
    const v = num(n[`${key}_100g`]);
    if (v != null) return v;
    const s = num(n[`${key}_serving`]);
    return s != null && servingQty ? (s * 100) / servingQty : undefined;
  };

  let kcal = per100('energy-kcal');
  if (kcal == null) {
    // `energy` vem sempre em kJ no Open Food Facts.
    const kj = per100('energy-kj') ?? per100('energy');
    if (kj != null) kcal = kj / 4.184;
  }
  const protein = per100('proteins');
  const fat = per100('fat');
  const carbs = per100('carbohydrates');

  const nutrients: Nutrients = { kcal: kcal ?? 0, protein: protein ?? 0, fat: fat ?? 0, carbs: carbs ?? 0 };
  for (const [key, offKey] of EXTRA_FIELDS) {
    const v = per100(offKey);
    if (v != null) nutrients[key] = v;
  }

  const isMl = [p.product_quantity_unit, p.serving_quantity_unit].some(
    (u) => typeof u === 'string' && u.toLowerCase() === 'ml',
  );
  const unit: Unit = isMl ? 'ml' : 'g';
  const packageSize = num(p.product_quantity);

  return {
    barcode: code,
    name: productName(p) ?? `Produto ${code}`,
    nameVersion: NAME_RULES_VERSION,
    brand: str(p.brands)?.split(',')[0].trim() || undefined,
    imageUrl: str(p.image_front_small_url) ?? str(p.image_small_url) ?? str(p.image_front_url) ?? str(p.image_url),
    unit,
    per100: nutrients,
    servingSize: servingQty && servingQty > 0 ? servingQty : undefined,
    servingLabel: servingQty && servingQty > 0 ? str(p.serving_size) : undefined,
    packageSize: packageSize && packageSize > 0 ? packageSize : undefined,
    source: 'off',
    incomplete: kcal == null || protein == null || fat == null || carbs == null ? true : undefined,
  };
}
