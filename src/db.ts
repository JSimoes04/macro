import Dexie, { type EntityTable } from 'dexie';
import type { Nutrients } from './lib/nutrition';

export type Unit = 'g' | 'ml';
export type MealId = 'breakfast' | 'lunch' | 'snack' | 'dinner';

export const MEALS: { id: MealId; label: string }[] = [
  { id: 'breakfast', label: 'Pequeno-almoço' },
  { id: 'lunch', label: 'Almoço' },
  { id: 'snack', label: 'Lanche' },
  { id: 'dinner', label: 'Jantar' },
];

export function mealLabel(id: MealId): string {
  return MEALS.find((m) => m.id === id)?.label ?? id;
}

/** Refeição sugerida pela hora do dia. */
export function mealForTime(d = new Date()): MealId {
  const h = d.getHours() + d.getMinutes() / 60;
  if (h < 11) return 'breakfast';
  if (h < 15.5) return 'lunch';
  if (h < 19) return 'snack';
  return 'dinner';
}

/** O que descreve um alimento (vem do Open Food Facts ou é criado à mão). */
export interface FoodData {
  barcode?: string;
  name: string;
  brand?: string;
  imageUrl?: string;
  unit: Unit;
  /** Valores por 100 g (ou 100 ml). */
  per100: Nutrients;
  servingSize?: number;
  servingLabel?: string;
  packageSize?: number;
  source: 'off' | 'manual';
  /** O Open Food Facts não tinha a informação nutricional completa. */
  incomplete?: boolean;
  /** Versão das regras com que o nome foi escolhido (só alimentos do Open Food Facts). */
  nameVersion?: number;
}

export interface Food extends FoodData {
  id: number;
  favorite: 0 | 1;
  useCount: number;
  lastUsedAt: number;
  lastAmount?: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * Um registo no diário. Guarda uma cópia dos valores do alimento, para que
 * editar ou apagar o alimento mais tarde não altere o histórico.
 */
export interface Entry {
  id: number;
  date: string;
  meal: MealId;
  createdAt: number;
  name: string;
  /** Totais para a quantidade registada. */
  nutrients: Nutrients;
  foodId?: number;
  brand?: string;
  imageUrl?: string;
  amount?: number;
  unit?: Unit;
  per100?: Nutrients;
  servingSize?: number;
  servingLabel?: string;
  packageSize?: number;
  /** Adição rápida: só calorias/macros, sem alimento associado. */
  quick?: boolean;
}

export interface WeightEntry {
  date: string;
  kg: number;
}

export interface Goals {
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
}

export interface Profile {
  sex: 'm' | 'f';
  age: number;
  heightCm: number;
  weightKg: number;
  activity: number;
  goal: 'lose' | 'maintain' | 'gain';
  ratePerWeek: number;
  proteinPerKg: number;
  fatPct: number;
}

export interface Settings {
  key: 'main';
  goals: Goals;
  goalsSet: boolean;
  profile?: Profile;
}

export const DEFAULT_GOALS: Goals = { kcal: 2000, protein: 140, fat: 65, carbs: 215 };
export const DEFAULT_SETTINGS: Settings = { key: 'main', goals: DEFAULT_GOALS, goalsSet: false };

class MacroDB extends Dexie {
  foods!: EntityTable<Food, 'id'>;
  entries!: EntityTable<Entry, 'id'>;
  weights!: EntityTable<WeightEntry, 'date'>;
  settings!: EntityTable<Settings, 'key'>;

  constructor() {
    super('macro');
    this.version(1).stores({
      foods: '++id, &barcode, name, lastUsedAt, useCount, favorite',
      entries: '++id, date, foodId',
      weights: 'date',
      settings: 'key',
    });
  }
}

export const db = new MacroDB();
