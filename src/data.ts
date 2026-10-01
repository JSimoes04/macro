import { db, DEFAULT_SETTINGS, type Entry, type Food, type FoodData, type Goals, type MealId, type Profile } from './db';
import { barcodeVariants, normalizeBarcode } from './lib/barcode';
import { scaleNutrients, type Nutrients } from './lib/nutrition';
import { fetchProduct } from './lib/off';

function cleanFood(data: FoodData): FoodData {
  const barcode = data.barcode ? normalizeBarcode(data.barcode) : '';
  return {
    ...data,
    name: data.name.trim(),
    brand: data.brand?.trim() || undefined,
    barcode: barcode || undefined,
    servingSize: data.servingSize && data.servingSize > 0 ? data.servingSize : undefined,
    servingLabel: data.servingSize && data.servingSize > 0 ? data.servingLabel?.trim() || undefined : undefined,
    packageSize: data.packageSize && data.packageSize > 0 ? data.packageSize : undefined,
  };
}

export async function findFoodByBarcode(code: string): Promise<Food | undefined> {
  return db.foods.where('barcode').anyOf(barcodeVariants(code)).first();
}

export async function addFood(data: FoodData): Promise<number> {
  const now = Date.now();
  return db.foods.add({ ...cleanFood(data), favorite: 0, useCount: 0, lastUsedAt: 0, createdAt: now, updatedAt: now });
}

export async function updateFood(id: number, data: FoodData): Promise<void> {
  // Campos a `undefined` são removidos do registo (ex.: código de barras apagado).
  await db.foods.update(id, { ...cleanFood(data), incomplete: data.incomplete, updatedAt: Date.now() });
}

export async function deleteFood(id: number): Promise<void> {
  await db.foods.delete(id);
}

export async function setFavorite(id: number, favorite: boolean): Promise<void> {
  await db.foods.update(id, { favorite: favorite ? 1 : 0 });
}

export type LookupResult =
  | { kind: 'found'; food: Food; source: 'local' | 'off' }
  | { kind: 'not-found'; code: string };

/**
 * Procura primeiro na base de dados local (funciona offline e é instantâneo);
 * só se não existir pergunta ao Open Food Facts e guarda o resultado.
 */
export async function lookupBarcode(raw: string, signal?: AbortSignal): Promise<LookupResult> {
  const code = normalizeBarcode(raw);
  const local = await findFoodByBarcode(code);
  if (local) return { kind: 'found', food: local, source: 'local' };

  const product = await fetchProduct(code, signal);
  if (!product) return { kind: 'not-found', code };

  const existing = await findFoodByBarcode(code);
  if (existing) return { kind: 'found', food: existing, source: 'local' };
  const id = await addFood(product);
  const food = await db.foods.get(id);
  if (!food) throw new Error('Não foi possível guardar o alimento.');
  return { kind: 'found', food, source: 'off' };
}

function entryFromFood(food: Food, amount: number, date: string, meal: MealId): Omit<Entry, 'id'> {
  return {
    date,
    meal,
    createdAt: Date.now(),
    foodId: food.id,
    name: food.name,
    brand: food.brand,
    imageUrl: food.imageUrl,
    amount,
    unit: food.unit,
    per100: food.per100,
    servingSize: food.servingSize,
    servingLabel: food.servingLabel,
    packageSize: food.packageSize,
    nutrients: scaleNutrients(food.per100, amount),
  };
}

export async function logFood(food: Food, amount: number, date: string, meal: MealId): Promise<number> {
  return db.transaction('rw', db.entries, db.foods, async () => {
    const id = await db.entries.add(entryFromFood(food, amount, date, meal));
    await db.foods
      .where('id')
      .equals(food.id)
      .modify((f) => {
        f.useCount += 1;
        f.lastUsedAt = Date.now();
        f.lastAmount = amount;
      });
    return id;
  });
}

/** Quantidade sugerida ao registar: a última usada, senão uma porção, senão 100. */
export function defaultAmount(food: Pick<Food, 'lastAmount' | 'servingSize'>): number {
  return food.lastAmount ?? food.servingSize ?? 100;
}

export async function updateEntry(entry: Entry, amount: number, meal: MealId): Promise<void> {
  const per100 = entry.per100;
  if (!per100) return;
  await db.transaction('rw', db.entries, db.foods, async () => {
    await db.entries.update(entry.id, { amount, meal, nutrients: scaleNutrients(per100, amount) });
    // Uma quantidade corrigida é a melhor sugestão para a próxima vez.
    if (entry.foodId != null) await db.foods.update(entry.foodId, { lastAmount: amount });
  });
}

export async function addQuickEntry(date: string, meal: MealId, name: string, nutrients: Nutrients): Promise<number> {
  return db.entries.add({ date, meal, createdAt: Date.now(), name, nutrients, quick: true });
}

export async function updateQuickEntry(id: number, meal: MealId, name: string, nutrients: Nutrients): Promise<void> {
  await db.entries.update(id, { meal, name, nutrients });
}

export async function deleteEntry(id: number): Promise<Entry | undefined> {
  const entry = await db.entries.get(id);
  await db.entries.delete(id);
  return entry;
}

export async function restoreEntry(entry: Entry): Promise<void> {
  await db.entries.put(entry);
}

export async function copyEntries(entries: Entry[], date: string, meal: MealId): Promise<number[]> {
  const now = Date.now();
  const copies = entries.map(({ id: _id, ...rest }, i) => ({ ...rest, date, meal, createdAt: now + i }));
  return db.entries.bulkAdd(copies, { allKeys: true });
}

export async function deleteEntries(ids: number[]): Promise<void> {
  await db.entries.bulkDelete(ids);
}

export async function setWeight(date: string, kg: number): Promise<void> {
  await db.weights.put({ date, kg });
}

export async function deleteWeight(date: string): Promise<void> {
  await db.weights.delete(date);
}

export async function saveGoals(goals: Goals, profile?: Profile): Promise<void> {
  await db.transaction('rw', db.settings, async () => {
    const current = (await db.settings.get('main')) ?? DEFAULT_SETTINGS;
    await db.settings.put({ ...current, goals, goalsSet: true, profile: profile ?? current.profile });
  });
}
