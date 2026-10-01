import type { Goals, Profile } from '../db';
import { KCAL_PER_KG } from './trend';

export const ACTIVITY_LEVELS = [
  { value: 1.2, label: 'Sedentário', hint: 'Pouco ou nenhum exercício' },
  { value: 1.375, label: 'Ligeiro', hint: 'Exercício 1–3 dias por semana' },
  { value: 1.55, label: 'Moderado', hint: 'Exercício 3–5 dias por semana' },
  { value: 1.725, label: 'Muito ativo', hint: 'Exercício 6–7 dias por semana' },
  { value: 1.9, label: 'Extremamente ativo', hint: 'Trabalho físico e treino diário' },
];

export const GOAL_OPTIONS: { id: Profile['goal']; label: string }[] = [
  { id: 'lose', label: 'Perder peso' },
  { id: 'maintain', label: 'Manter' },
  { id: 'gain', label: 'Ganhar peso' },
];

export const RATE_OPTIONS = [0.25, 0.5, 0.75, 1];
export const PROTEIN_OPTIONS = [1.6, 1.8, 2, 2.2];

export const DEFAULT_PROFILE: Profile = {
  sex: 'm',
  age: 30,
  heightCm: 175,
  weightKg: 75,
  activity: 1.55,
  goal: 'maintain',
  ratePerWeek: 0.5,
  proteinPerKg: 1.8,
  fatPct: 30,
};

/** Metabolismo basal (fórmula de Mifflin-St Jeor). */
export function bmr(p: Pick<Profile, 'sex' | 'age' | 'heightCm' | 'weightKg'>): number {
  return 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age + (p.sex === 'm' ? 5 : -161);
}

export interface GoalsResult {
  bmr: number;
  tdee: number;
  goals: Goals;
  /** O objetivo calculado ficou abaixo do mínimo recomendado e foi ajustado. */
  clamped: boolean;
}

export function computeGoals(p: Profile, tdeeOverride?: number): GoalsResult {
  const basal = bmr(p);
  const tdee = tdeeOverride ?? basal * p.activity;
  const sign = p.goal === 'lose' ? -1 : p.goal === 'gain' ? 1 : 0;
  const dailyDelta = (sign * p.ratePerWeek * KCAL_PER_KG) / 7;
  const minKcal = p.sex === 'm' ? 1500 : 1200;
  const raw = Math.round((tdee + dailyDelta) / 10) * 10;
  const kcal = Math.max(minKcal, raw);
  const protein = Math.round(p.proteinPerKg * p.weightKg);
  const fat = Math.round((kcal * p.fatPct) / 100 / 9);
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  return { bmr: basal, tdee, goals: { kcal, protein, fat, carbs }, clamped: raw < minKcal };
}
