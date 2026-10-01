import { useEffect, useMemo, useState, type RefObject } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, DEFAULT_SETTINGS, type Settings } from './db';
import { addDays, todayISO } from './lib/dates';
import { sumNutrients, type Nutrients } from './lib/nutrition';
import { estimateExpenditure } from './lib/trend';

/** `undefined` enquanto carrega. */
export function useSettings(): Settings | undefined {
  return useLiveQuery(async () => (await db.settings.get('main')) ?? DEFAULT_SETTINGS, []);
}

/** Totais por dia entre duas datas (inclusive). */
export function useDailyTotals(start: string, end: string): Map<string, Nutrients> | undefined {
  return useLiveQuery(async () => {
    const entries = await db.entries.where('date').between(start, end, true, true).toArray();
    const byDate = new Map<string, Nutrients[]>();
    for (const e of entries) byDate.set(e.date, [...(byDate.get(e.date) ?? []), e.nutrients]);
    return new Map([...byDate].map(([d, list]) => [d, sumNutrients(list)]));
  }, [start, end]);
}

export function useExpenditure(today: string) {
  const totals = useDailyTotals(addDays(today, -28), today);
  const weights = useLiveQuery(() => db.weights.toArray(), []);
  return useMemo(() => {
    if (!totals || !weights) return undefined;
    const intake = new Map([...totals].map(([d, n]) => [d, n.kcal]));
    return estimateExpenditure(intake, weights, today) ?? null;
  }, [totals, weights, today]);
}

/** A data de hoje, atualizada à meia-noite e quando a app volta a primeiro plano. */
export function useToday(): string {
  const [today, setToday] = useState(todayISO);
  useEffect(() => {
    const update = () => setToday(todayISO());
    const timer = setInterval(update, 60_000);
    document.addEventListener('visibilitychange', update);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);
  return today;
}

export function useElementWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.getBoundingClientRect().width);
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function isIOS(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}
