import type { Food } from '../db';

export function normalizeText(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Procura por nome, marca ou código, ignorando acentos e maiúsculas. */
export function searchFoods(foods: Food[], query: string): Food[] {
  const tokens = normalizeText(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return foods;
  return foods
    .filter((f) => {
      const haystack = normalizeText(`${f.name} ${f.brand ?? ''} ${f.barcode ?? ''}`);
      return tokens.every((t) => haystack.includes(t));
    })
    .sort((a, b) => b.useCount - a.useCount || a.name.localeCompare(b.name, 'pt'));
}

export const byName = (a: Food, b: Food) => a.name.localeCompare(b.name, 'pt');
export const byRecent = (a: Food, b: Food) => b.lastUsedAt - a.lastUsedAt || b.createdAt - a.createdAt;
export const byUse = (a: Food, b: Food) => b.useCount - a.useCount || byName(a, b);
