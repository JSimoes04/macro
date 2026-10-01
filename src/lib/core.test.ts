import { describe, expect, it } from 'vitest';
import { barcodeVariants, isValidGtin, normalizeBarcode } from './barcode';
import { addDays, dateRange, diffDays, formatRelativeDay } from './dates';
import { bmr, computeGoals } from './goals';
import { kcalFromMacros, parseDecimal, scaleNutrients, sumNutrients, toInputValue } from './nutrition';
import { searchFoods } from './search';
import { computeTrend, estimateExpenditure } from './trend';
import type { Food, Profile, WeightEntry } from '../db';

describe('códigos de barras', () => {
  it('normaliza UPC-A para EAN-13', () => {
    expect(normalizeBarcode('036000291452')).toBe('0036000291452');
    expect(normalizeBarcode('5601 2345 6789 0')).toBe('5601234567890');
  });

  it('gera as variantes equivalentes', () => {
    expect(barcodeVariants('036000291452')).toEqual(['0036000291452', '036000291452']);
    expect(barcodeVariants('3017620422003')).toEqual(['3017620422003']);
  });

  it('valida o dígito de controlo', () => {
    expect(isValidGtin('3017620422003')).toBe(true);
    expect(isValidGtin('5603722519000')).toBe(true);
    expect(isValidGtin('036000291452')).toBe(true);
    expect(isValidGtin('96385074')).toBe(true);
    expect(isValidGtin('3017620422004')).toBe(false);
    expect(isValidGtin('123')).toBe(false);
  });
});

describe('nutrientes', () => {
  it('escala por quantidade', () => {
    const n = scaleNutrients({ kcal: 539, protein: 6.3, fat: 30.9, carbs: 57.5, sugar: 56.3 }, 15);
    expect(n.kcal).toBeCloseTo(80.85);
    expect(n.sugar).toBeCloseTo(8.445);
    expect(n.fiber).toBeUndefined();
  });

  it('soma registos', () => {
    const total = sumNutrients([
      { kcal: 100, protein: 10, fat: 2, carbs: 5 },
      { kcal: 50, protein: 1, fat: 1, carbs: 8 },
    ]);
    expect(total).toEqual({ kcal: 150, protein: 11, fat: 3, carbs: 13 });
  });

  it('lê números com vírgula ou ponto', () => {
    expect(parseDecimal('1,5')).toBe(1.5);
    expect(parseDecimal('1.5')).toBe(1.5);
    expect(parseDecimal(' 125 ')).toBe(125);
    expect(parseDecimal('')).toBeUndefined();
    expect(parseDecimal(',')).toBeUndefined();
    expect(parseDecimal('1,2,3')).toBeUndefined();
    expect(toInputValue(12.345, 1)).toBe('12,3');
  });

  it('calcula kcal pelos macros', () => {
    expect(kcalFromMacros({ protein: 10, fat: 10, carbs: 10 })).toBe(170);
  });
});

describe('datas', () => {
  it('soma dias sem ser afetada pela hora de verão', () => {
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30');
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(diffDays('2026-03-01', '2026-04-01')).toBe(31);
  });

  it('descreve dias relativos', () => {
    expect(formatRelativeDay('2026-10-01', '2026-10-01')).toBe('Hoje');
    expect(formatRelativeDay('2026-09-30', '2026-10-01')).toBe('Ontem');
    expect(formatRelativeDay('2026-10-02', '2026-10-01')).toBe('Amanhã');
  });

  it('gera intervalos inclusivos', () => {
    expect(dateRange('2026-09-29', '2026-10-01')).toEqual(['2026-09-29', '2026-09-30', '2026-10-01']);
  });
});

describe('peso de tendência', () => {
  it('começa no primeiro peso e suaviza', () => {
    const trend = computeTrend([
      { date: '2026-09-01', kg: 80 },
      { date: '2026-09-02', kg: 81 },
    ]);
    expect(trend[0].trend).toBe(80);
    expect(trend[1].trend).toBeCloseTo(80.1);
  });

  it('dá mais peso a uma pesagem depois de vários dias sem pesar', () => {
    const daily = computeTrend([
      { date: '2026-09-01', kg: 80 },
      { date: '2026-09-02', kg: 79 },
    ]);
    const gap = computeTrend([
      { date: '2026-09-01', kg: 80 },
      { date: '2026-09-11', kg: 79 },
    ]);
    expect(80 - gap[1].trend).toBeGreaterThan(80 - daily[1].trend);
  });
});

describe('gasto energético estimado', () => {
  const today = '2026-10-01';

  function scenario(intake: number, kgPerWeek: number, days = 28) {
    const intakeByDate = new Map<string, number>();
    const weights: WeightEntry[] = [];
    // Pesagens desde muito antes, para a tendência já estar estabilizada no ritmo.
    for (let i = 120; i >= 0; i--) {
      const date = addDays(today, -i);
      weights.push({ date, kg: 85 + (kgPerWeek / 7) * (120 - i) });
      if (i >= 1 && i <= days) intakeByDate.set(date, intake);
    }
    return estimateExpenditure(intakeByDate, weights, today);
  }

  it('estima o gasto quando o peso desce', () => {
    // −0,5 kg/semana = −550 kcal/dia → gasto ≈ 2000 + 550
    const est = scenario(2000, -0.5);
    expect(est).not.toBeNull();
    expect(est!.tdee).toBeGreaterThan(2500);
    expect(est!.tdee).toBeLessThan(2600);
    expect(est!.loggedDays).toBe(28);
  });

  it('com peso estável, gasto = ingestão', () => {
    expect(scenario(2300, 0)!.tdee).toBeCloseTo(2300, 0);
  });

  it('precisa de dias registados suficientes', () => {
    expect(scenario(2000, 0, 5)).toBeNull();
  });
});

describe('objetivos', () => {
  const profile: Profile = {
    sex: 'm',
    age: 30,
    heightCm: 180,
    weightKg: 80,
    activity: 1.55,
    goal: 'lose',
    ratePerWeek: 0.5,
    proteinPerKg: 2,
    fatPct: 30,
  };

  it('calcula o metabolismo basal (Mifflin-St Jeor)', () => {
    expect(bmr(profile)).toBe(1780);
    expect(bmr({ ...profile, sex: 'f' })).toBe(1614);
  });

  it('aplica défice e reparte os macros', () => {
    const r = computeGoals(profile);
    expect(r.tdee).toBeCloseTo(2759);
    expect(r.goals.kcal).toBe(2210);
    expect(r.goals.protein).toBe(160);
    expect(r.goals.fat).toBe(74);
    expect(r.goals.carbs).toBe(226);
    expect(r.clamped).toBe(false);
  });

  it('usa o gasto medido quando é dado e respeita o mínimo', () => {
    expect(computeGoals({ ...profile, goal: 'maintain' }, 2500).goals.kcal).toBe(2500);
    const low = computeGoals({ ...profile, sex: 'f', weightKg: 50, ratePerWeek: 1 }, 1500);
    expect(low.goals.kcal).toBe(1200);
    expect(low.clamped).toBe(true);
  });
});

describe('pesquisa', () => {
  const food = (id: number, name: string, brand?: string, useCount = 0): Food => ({
    id,
    name,
    brand,
    unit: 'g',
    per100: { kcal: 0, protein: 0, fat: 0, carbs: 0 },
    source: 'manual',
    favorite: 0,
    useCount,
    lastUsedAt: 0,
    createdAt: 0,
    updatedAt: 0,
  });

  it('ignora acentos e combina palavras', () => {
    const foods = [food(1, 'Pão de forma', 'Bimbo'), food(2, 'Iogurte grego', 'Mimosa'), food(3, 'Pão integral', 'Continente', 5)];
    expect(searchFoods(foods, 'pao').map((f) => f.id)).toEqual([3, 1]);
    expect(searchFoods(foods, 'grego mimosa').map((f) => f.id)).toEqual([2]);
  });
});
