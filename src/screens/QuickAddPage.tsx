import { useEffect, useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useConfirm, useToast } from '../components/Feedback';
import { Icon } from '../components/Icon';
import { DecimalInput, MealChoice, Page, PageHeader } from '../components/ui';
import { addQuickEntry, deleteEntry, restoreEntry, updateQuickEntry } from '../data';
import { db, mealLabel, type MealId } from '../db';
import { fmtKcal, kcalFromMacros, MACROS, parseDecimal, toInputValue, type MacroKey } from '../lib/nutrition';
import { useNav, usePageKey } from '../nav';

/** Registar só calorias (e macros, se se souberem): restaurantes, receitas, etc. */
export function QuickAddPage({ date, meal: initialMeal, entryId }: { date: string; meal: MealId; entryId?: number }) {
  const nav = useNav();
  const pageKey = usePageKey();
  const toast = useToast();
  const confirm = useConfirm();
  const entry = useLiveQuery(async () => (entryId != null ? ((await db.entries.get(entryId)) ?? null) : null), [entryId]);

  const [loaded, setLoaded] = useState(entryId == null);
  const [name, setName] = useState('');
  const [meal, setMeal] = useState(initialMeal);
  const [kcal, setKcal] = useState('');
  const [macros, setMacros] = useState<Record<MacroKey, string>>({ protein: '', fat: '', carbs: '' });
  const [error, setError] = useState('');

  useEffect(() => {
    if (entryId != null && entry === null) nav.remove(pageKey);
    if (entry && !loaded) {
      setName(entry.name === 'Adição rápida' ? '' : entry.name);
      setMeal(entry.meal);
      setKcal(toInputValue(entry.nutrients.kcal, 0));
      setMacros({
        protein: entry.nutrients.protein ? toInputValue(entry.nutrients.protein) : '',
        fat: entry.nutrients.fat ? toInputValue(entry.nutrients.fat) : '',
        carbs: entry.nutrients.carbs ? toInputValue(entry.nutrients.carbs) : '',
      });
      setLoaded(true);
    }
  }, [entry, entryId, loaded, nav, pageKey]);

  if (!loaded) return <Page />;

  const p = parseDecimal(macros.protein) ?? 0;
  const f = parseDecimal(macros.fat) ?? 0;
  const c = parseDecimal(macros.carbs) ?? 0;
  const macroKcal = kcalFromMacros({ protein: p, fat: f, carbs: c });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const k = parseDecimal(kcal) ?? (macroKcal > 0 ? macroKcal : undefined);
    if (k == null || k <= 0) {
      setError('Indica as calorias (ou os macros).');
      return;
    }
    const nutrients = { kcal: k, protein: p, fat: f, carbs: c };
    const label = name.trim() || 'Adição rápida';
    if (entry) {
      await updateQuickEntry(entry.id, meal, label, nutrients);
      nav.pop();
    } else {
      const id = await addQuickEntry(date, meal, label, nutrients);
      nav.pop();
      toast({
        message: `${fmtKcal(k)} kcal adicionadas ao ${mealLabel(meal).toLowerCase()}`,
        action: { label: 'Anular', run: () => void deleteEntry(id) },
      });
    }
  };

  const remove = async () => {
    if (!entry) return;
    const ok = await confirm({ title: 'Eliminar este registo?', confirmLabel: 'Eliminar', destructive: true });
    if (!ok) return;
    const removed = await deleteEntry(entry.id);
    nav.pop();
    if (removed) toast({ message: 'Registo eliminado', action: { label: 'Anular', run: () => void restoreEntry(removed) } });
  };

  return (
    <Page>
      <PageHeader title={entry ? 'Editar adição rápida' : 'Adição rápida'} />
      <form className="page-form" onSubmit={submit} noValidate>
        <div className="page-body">
          <section className="card form-card">
            <div className="field">
              <label htmlFor="q-kcal">Calorias (kcal)</label>
              <DecimalInput
                id="q-kcal"
                className="input input-big"
                value={kcal}
                onChange={(v) => {
                  setKcal(v);
                  setError('');
                }}
                placeholder={macroKcal > 0 ? toInputValue(macroKcal, 0) : ''}
                enterKeyHint="next"
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? 'q-error' : undefined}
              />
              {error && (
                <p id="q-error" className="field-error" role="alert">
                  {error}
                </p>
              )}
            </div>
            <div className="grid-3">
              {MACROS.map((m) => (
                <div className="field" key={m.key}>
                  <label htmlFor={`q-${m.key}`}>
                    <span className={`dot dot-${m.key}`} aria-hidden="true" /> {m.label} (g)
                  </label>
                  <DecimalInput
                    id={`q-${m.key}`}
                    className="input"
                    value={macros[m.key]}
                    onChange={(v) => setMacros({ ...macros, [m.key]: v })}
                    enterKeyHint="next"
                  />
                </div>
              ))}
            </div>
            {macroKcal > 0 && <p className="field-hint">Os macros somam {fmtKcal(macroKcal)} kcal.</p>}
            <div className="field">
              <label htmlFor="q-name">
                Descrição <span className="optional">(opcional)</span>
              </label>
              <input
                id="q-name"
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: Jantar fora"
                autoComplete="off"
                enterKeyHint="done"
              />
            </div>
            <div className="field">
              <span className="field-label">Refeição</span>
              <MealChoice value={meal} onChange={setMeal} />
            </div>
          </section>
        </div>
        <div className="page-footer">
          {entry && (
            <button type="button" className="btn btn-danger-ghost" onClick={remove}>
              <Icon name="trash" size={18} /> Eliminar
            </button>
          )}
          <button type="submit" className="btn btn-primary btn-block">
            {entry ? 'Guardar' : 'Adicionar ao diário'}
          </button>
        </div>
      </form>
    </Page>
  );
}
