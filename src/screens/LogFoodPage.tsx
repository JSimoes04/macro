import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useConfirm, useToast } from '../components/Feedback';
import { Icon } from '../components/Icon';
import { Choice, DecimalInput, MealChoice, Page, PageHeader, Thumb } from '../components/ui';
import { defaultAmount, deleteEntry, logFood, restoreEntry, setFavorite, updateEntry } from '../data';
import { db, mealLabel, type MealId, type Settings, type Unit } from '../db';
import { useSettings, useToday } from '../hooks';
import { formatRelativeDay } from '../lib/dates';
import {
  EXTRAS,
  fmtAmount,
  fmtGrams,
  fmtKcal,
  MACROS,
  parseDecimal,
  scaleNutrients,
  toInputValue,
  type Nutrients,
} from '../lib/nutrition';
import { displayBrand } from '../lib/text';
import { useNav, usePageKey } from '../nav';

/** O que é preciso saber de um alimento para escolher a quantidade. */
interface Portionable {
  name: string;
  brand?: string;
  imageUrl?: string;
  barcode?: string;
  unit: Unit;
  per100: Nutrients;
  servingSize?: number;
  servingLabel?: string;
  packageSize?: number;
}

type UnitId = 'base' | 'serving' | 'package';

function unitOptions(item: Portionable): { id: UnitId; size: number; label: string }[] {
  const opts: { id: UnitId; size: number; label: string }[] = [{ id: 'base', size: 1, label: item.unit }];
  if (item.servingSize) opts.push({ id: 'serving', size: item.servingSize, label: 'Porção' });
  if (item.packageSize && item.packageSize !== item.servingSize) {
    opts.push({ id: 'package', size: item.packageSize, label: 'Embalagem' });
  }
  return opts;
}

/* ---------- Registar um alimento novo no diário ---------- */

export function LogFoodPage({
  foodId,
  date,
  meal,
  scanned,
}: {
  foodId: number;
  date: string;
  meal: MealId;
  scanned?: 'off' | 'local';
}) {
  const nav = useNav();
  const pageKey = usePageKey();
  const toast = useToast();
  const food = useLiveQuery(async () => (await db.foods.get(foodId)) ?? null, [foodId]);

  // Se o alimento for apagado (no editor), este ecrã fecha-se.
  useEffect(() => {
    if (food === null) nav.remove(pageKey);
  }, [food, nav, pageKey]);

  if (!food) return <Page />;

  return (
    <AmountForm
      item={food}
      title="Adicionar"
      date={date}
      initialAmount={defaultAmount(food)}
      initialMeal={meal}
      submitLabel="Adicionar ao diário"
      headerActions={
        <>
          <button
            type="button"
            className="icon-btn"
            aria-pressed={food.favorite === 1}
            aria-label="Favorito"
            onClick={() => void setFavorite(food.id, food.favorite !== 1)}
          >
            <Icon name="star" filled={food.favorite === 1} />
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Editar alimento"
            onClick={() => nav.push({ name: 'food', foodId: food.id })}
          >
            <Icon name="edit" />
          </button>
        </>
      }
      notice={
        food.incomplete ? (
          <div className="notice notice-warning" role="alert">
            <Icon name="alert" className="icon-warning" />
            <div>
              <p className="notice-title">Informação nutricional incompleta</p>
              <p className="notice-text">O Open Food Facts não tem todos os valores deste produto. Completa-os com o rótulo.</p>
              <button type="button" className="btn btn-small" onClick={() => nav.push({ name: 'food', foodId: food.id })}>
                Completar valores
              </button>
            </div>
          </div>
        ) : scanned === 'off' ? (
          <p className="notice notice-info">
            <Icon name="check" size={18} /> Encontrado no Open Food Facts e guardado nos teus alimentos.
          </p>
        ) : null
      }
      onSubmit={async (amount, chosenMeal) => {
        const id = await logFood(food, amount, date, chosenMeal);
        nav.pop();
        toast({
          message: `Adicionado ao ${mealLabel(chosenMeal).toLowerCase()}`,
          action: { label: 'Anular', run: () => void deleteEntry(id) },
        });
      }}
    />
  );
}

/* ---------- Editar um registo do diário ---------- */

export function EntryPage({ entryId }: { entryId: number }) {
  const nav = useNav();
  const pageKey = usePageKey();
  const toast = useToast();
  const confirm = useConfirm();
  const entry = useLiveQuery(async () => (await db.entries.get(entryId)) ?? null, [entryId]);

  useEffect(() => {
    if (entry === null) nav.remove(pageKey);
  }, [entry, nav, pageKey]);

  if (!entry) return <Page />;
  if (!entry.per100 || entry.amount == null) {
    return (
      <Page>
        <PageHeader title={entry.name} />
      </Page>
    );
  }

  const item: Portionable = {
    name: entry.name,
    brand: entry.brand,
    imageUrl: entry.imageUrl,
    unit: entry.unit ?? 'g',
    per100: entry.per100,
    servingSize: entry.servingSize,
    servingLabel: entry.servingLabel,
    packageSize: entry.packageSize,
  };

  const remove = async () => {
    const ok = await confirm({ title: 'Eliminar este registo?', confirmLabel: 'Eliminar', destructive: true });
    if (!ok) return;
    const removed = await deleteEntry(entry.id);
    nav.pop();
    if (removed) toast({ message: 'Registo eliminado', action: { label: 'Anular', run: () => void restoreEntry(removed) } });
  };

  return (
    <AmountForm
      item={item}
      title="Editar registo"
      date={entry.date}
      initialAmount={entry.amount}
      initialMeal={entry.meal}
      submitLabel="Guardar"
      headerActions={
        entry.foodId != null ? (
          <button
            type="button"
            className="icon-btn"
            aria-label="Registar outra vez"
            title="Registar outra vez"
            onClick={() => entry.foodId != null && nav.push({ name: 'log', foodId: entry.foodId, date: entry.date, meal: entry.meal })}
          >
            <Icon name="copy" />
          </button>
        ) : undefined
      }
      secondaryAction={
        <button type="button" className="btn btn-danger-ghost" onClick={remove}>
          <Icon name="trash" size={18} /> Eliminar
        </button>
      }
      onSubmit={async (amount, meal) => {
        await updateEntry(entry, amount, meal);
        nav.pop();
      }}
    />
  );
}

/* ---------- Formulário partilhado ---------- */

function AmountForm({
  item,
  title,
  date,
  initialAmount,
  initialMeal,
  submitLabel,
  headerActions,
  notice,
  secondaryAction,
  onSubmit,
}: {
  item: Portionable;
  title: string;
  date: string;
  initialAmount: number;
  initialMeal: MealId;
  submitLabel: string;
  headerActions?: ReactNode;
  notice?: ReactNode;
  secondaryAction?: ReactNode;
  onSubmit: (amount: number, meal: MealId) => Promise<void>;
}) {
  const settings = useSettings();
  const today = useToday();
  const units = unitOptions(item);
  const startsAsServing = item.servingSize != null && Math.abs(initialAmount - item.servingSize) < 1e-6;
  const [unitId, setUnitId] = useState<UnitId>(startsAsServing ? 'serving' : 'base');
  const [qty, setQty] = useState(startsAsServing ? '1' : toInputValue(initialAmount, 2));
  const [meal, setMeal] = useState(initialMeal);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const unit = units.find((u) => u.id === unitId) ?? units[0];
  const parsed = parseDecimal(qty);
  const amount = parsed != null ? parsed * unit.size : undefined;
  const totals = useMemo(() => scaleNutrients(item.per100, amount ?? 0), [item.per100, amount]);

  const changeUnit = (id: UnitId) => {
    const next = units.find((u) => u.id === id) ?? units[0];
    if (amount != null && amount > 0) setQty(toInputValue(amount / next.size, 2));
    else setQty(id === 'base' ? '100' : '1');
    setUnitId(id);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (amount == null || amount <= 0) {
      setError('Indica uma quantidade maior que zero.');
      return;
    }
    setBusy(true);
    try {
      await onSubmit(amount, meal);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page>
      <PageHeader title={title} actions={headerActions} />
      <form className="page-form" onSubmit={submit} noValidate>
        <div className="page-body">
          <div className="food-head">
            <Thumb src={item.imageUrl} name={item.name} size={64} eager />
            <div>
              <h2>{item.name}</h2>
              {displayBrand(item.name, item.brand) && <p className="food-head-brand">{item.brand}</p>}
              <p className="food-head-date">
                <Icon name="calendar" size={14} /> {formatRelativeDay(date, today)}
              </p>
            </div>
          </div>

          {notice}

          <section className="card form-card">
            <div className="field">
              <label htmlFor="qty">Quantidade</label>
              <div className="qty-row">
                <DecimalInput
                  id="qty"
                  className="input input-big"
                  value={qty}
                  onChange={(v) => {
                    setQty(v);
                    setError('');
                  }}
                  enterKeyHint="done"
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? 'qty-error' : 'qty-hint'}
                />
                {units.length > 1 ? (
                  <Choice
                    name="unit"
                    legend="Unidade"
                    className="choice-units"
                    value={unitId}
                    onChange={changeUnit}
                    options={units.map((u) => ({ value: u.id, label: u.label }))}
                  />
                ) : (
                  <span className="qty-unit">{item.unit}</span>
                )}
              </div>
              {error ? (
                <p id="qty-error" className="field-error" role="alert">
                  {error}
                </p>
              ) : (
                <p id="qty-hint" className="field-hint">
                  {unit.id === 'base'
                    ? item.servingSize
                      ? `1 porção = ${fmtAmount(item.servingSize)} ${item.unit}${item.servingLabel ? ` (${item.servingLabel})` : ''}`
                      : `Valores do rótulo por 100 ${item.unit}`
                    : amount != null
                      ? `= ${fmtAmount(amount)} ${item.unit}`
                      : ' '}
                </p>
              )}
            </div>
            <div className="field">
              <span className="field-label" id="meal-label">
                Refeição
              </span>
              <MealChoice value={meal} onChange={setMeal} />
            </div>
          </section>

          <NutritionCard totals={totals} item={item} settings={settings} />
        </div>
        <div className="page-footer">
          {secondaryAction}
          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {submitLabel}
          </button>
        </div>
      </form>
    </Page>
  );
}

function NutritionCard({ totals, item, settings }: { totals: Nutrients; item: Portionable; settings?: Settings }) {
  const goals = settings?.goals;
  const kcalPct = goals && goals.kcal > 0 ? Math.round((totals.kcal / goals.kcal) * 100) : null;
  const extras = EXTRAS.filter((x) => totals[x.key] != null);
  return (
    <section className="card nutrition" aria-label="Valores para esta quantidade">
      <div className="nutrition-kcal">
        <p>
          <strong>{fmtKcal(totals.kcal)}</strong> kcal
        </p>
        {kcalPct != null && <p className="nutrition-pct">{kcalPct}% do objetivo diário</p>}
      </div>
      <dl className="nutrition-macros">
        {MACROS.map((m) => (
          <div key={m.key}>
            <dt>
              <span className={`dot dot-${m.key}`} aria-hidden="true" />
              {m.label}
            </dt>
            <dd>{fmtGrams(totals[m.key])} g</dd>
          </div>
        ))}
      </dl>
      {extras.length > 0 && (
        <dl className="nutrition-extras">
          {extras.map((x) => (
            <div key={x.key}>
              <dt>{x.label}</dt>
              <dd>{fmtGrams(totals[x.key] ?? 0)} g</dd>
            </div>
          ))}
        </dl>
      )}
      <p className="nutrition-per100">
        Por 100 {item.unit}: {fmtKcal(item.per100.kcal)} kcal · P {fmtGrams(item.per100.protein)} · G{' '}
        {fmtGrams(item.per100.fat)} · H {fmtGrams(item.per100.carbs)}
        {item.barcode && (
          <>
            {' '}
            · <span className="mono">{item.barcode}</span>
          </>
        )}
      </p>
    </section>
  );
}
