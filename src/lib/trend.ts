import type { WeightEntry } from '../db';
import { addDays, diffDays } from './dates';

/** Suavização diária do peso de tendência (o mesmo princípio do MacroFactor). */
export const TREND_ALPHA = 0.1;
/** Energia aproximada de 1 kg de massa corporal. */
export const KCAL_PER_KG = 7700;

export interface TrendPoint {
  date: string;
  kg: number;
  trend: number;
}

/**
 * Média móvel exponencial do peso. O peso da balança varia muito de dia para dia
 * (água, sal, digestão); a tendência mostra a variação real.
 * Os dias sem pesagem contam: depois de um intervalo de N dias, a nova pesagem
 * pesa como N dias de suavização.
 */
export function computeTrend(weights: WeightEntry[], alpha = TREND_ALPHA): TrendPoint[] {
  const sorted = [...weights].sort((a, b) => a.date.localeCompare(b.date));
  const out: TrendPoint[] = [];
  let trend = 0;
  let prev: string | undefined;
  for (const w of sorted) {
    if (prev === undefined) {
      trend = w.kg;
    } else {
      const gap = diffDays(prev, w.date);
      trend += (1 - (1 - alpha) ** gap) * (w.kg - trend);
    }
    out.push({ date: w.date, kg: w.kg, trend });
    prev = w.date;
  }
  return out;
}

export interface ExpenditureEstimate {
  tdee: number;
  avgIntake: number;
  loggedDays: number;
  deltaKg: number;
  spanDays: number;
  windowDays: number;
}

export const MIN_LOGGED_DAYS = 10;
export const MIN_WEIGHT_SPAN_DAYS = 7;

/**
 * Gasto energético estimado pelo balanço energético:
 *   gasto ≈ ingestão média − variação do peso de tendência × 7700 kcal ÷ dias.
 * Só contam os dias com comida registada (um dia vazio quase sempre é um dia
 * por registar, não um dia de jejum). O dia de hoje fica de fora porque ainda não acabou.
 */
export function estimateExpenditure(
  intakeByDate: Map<string, number>,
  weights: WeightEntry[],
  today: string,
  windowDays = 28,
): ExpenditureEstimate | null {
  const end = addDays(today, -1);
  const start = addDays(end, -(windowDays - 1));

  let total = 0;
  let loggedDays = 0;
  for (const [date, kcal] of intakeByDate) {
    if (date >= start && date <= end && kcal > 0) {
      total += kcal;
      loggedDays++;
    }
  }
  if (loggedDays < MIN_LOGGED_DAYS) return null;

  const points = computeTrend(weights).filter((p) => p.date >= start && p.date <= today);
  if (points.length < 2) return null;
  const first = points[0];
  const last = points[points.length - 1];
  const spanDays = diffDays(first.date, last.date);
  if (spanDays < MIN_WEIGHT_SPAN_DAYS) return null;

  const avgIntake = total / loggedDays;
  const deltaKg = last.trend - first.trend;
  const tdee = avgIntake - (deltaKg * KCAL_PER_KG) / spanDays;
  if (!Number.isFinite(tdee) || tdee < 800 || tdee > 6000) return null;
  return { tdee, avgIntake, loggedDays, deltaKg, spanDays, windowDays };
}
