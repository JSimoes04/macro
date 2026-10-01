import { db } from '../db';
import { todayISO } from './dates';

/**
 * Os dados vivem só no iPhone (IndexedDB). A cópia de segurança é um ficheiro
 * JSON que pode ser guardado na app Ficheiros/iCloud e reposto noutro aparelho.
 */
const BACKUP_VERSION = 1;

const tables = () => [db.foods, db.entries, db.weights, db.settings];

export async function buildBackup(): Promise<File> {
  const [foods, entries, weights, settings] = await Promise.all([
    db.foods.toArray(),
    db.entries.toArray(),
    db.weights.toArray(),
    db.settings.toArray(),
  ]);
  const payload = { app: 'macro', version: BACKUP_VERSION, exportedAt: new Date().toISOString(), foods, entries, weights, settings };
  return new File([JSON.stringify(payload)], `macro-copia-${todayISO()}.json`, { type: 'application/json' });
}

export interface RestoreSummary {
  foods: number;
  entries: number;
  weights: number;
}

export async function restoreBackup(file: File): Promise<RestoreSummary> {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new Error('O ficheiro não é um JSON válido.');
  }
  const { foods, entries, weights, settings } = data;
  if (data.app !== 'macro' || !Array.isArray(foods) || !Array.isArray(entries) || !Array.isArray(weights)) {
    throw new Error('Este ficheiro não é uma cópia de segurança do Macro.');
  }
  await db.transaction('rw', tables(), async () => {
    await Promise.all(tables().map((t) => t.clear()));
    await db.foods.bulkAdd(foods);
    await db.entries.bulkAdd(entries);
    await db.weights.bulkAdd(weights);
    if (Array.isArray(settings)) await db.settings.bulkAdd(settings);
  });
  return { foods: foods.length, entries: entries.length, weights: weights.length };
}

export async function clearAllData(): Promise<void> {
  await db.transaction('rw', tables(), () => Promise.all(tables().map((t) => t.clear())));
}

/**
 * No iPhone abre a folha de partilha (Guardar em Ficheiros, AirDrop, …);
 * noutros browsers descarrega o ficheiro.
 */
export async function shareFile(file: File): Promise<'shared' | 'downloaded' | 'cancelled'> {
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: file.name });
      return 'shared';
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
      throw err;
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'downloaded';
}
