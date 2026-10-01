import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useConfirm, useToast } from '../components/Feedback';
import { Icon } from '../components/Icon';
import { Choice, DecimalInput, Page, PageHeader } from '../components/ui';
import { addFood, deleteFood, findFoodByBarcode, updateFood } from '../data';
import { db, type Food, type FoodData, type MealId, type Unit } from '../db';
import { isValidGtin, normalizeBarcode } from '../lib/barcode';
import { EXTRAS, fmtKcal, kcalFromMacros, parseDecimal, toInputValue, type ExtraKey, type Nutrients } from '../lib/nutrition';
import { useNav, usePageKey } from '../nav';

type NumKey = 'kcal' | 'protein' | 'fat' | 'carbs' | ExtraKey;

interface FormState {
  name: string;
  brand: string;
  barcode: string;
  unit: Unit;
  basis: 'per100' | 'serving';
  values: Record<NumKey, string>;
  servingSize: string;
  servingLabel: string;
  packageSize: string;
}

type Errors = Partial<Record<'name' | 'barcode' | 'servingSize' | 'packageSize' | NumKey, string>>;

const MAIN_FIELDS: { key: NumKey; label: string; unit: string }[] = [
  { key: 'kcal', label: 'Calorias', unit: 'kcal' },
  { key: 'protein', label: 'Proteína', unit: 'g' },
  { key: 'fat', label: 'Gordura', unit: 'g' },
  { key: 'carbs', label: 'Hidratos de carbono', unit: 'g' },
];

function emptyForm(barcode?: string, name?: string): FormState {
  return {
    name: name ?? '',
    brand: '',
    barcode: barcode ?? '',
    unit: 'g',
    basis: 'per100',
    values: { kcal: '', protein: '', fat: '', carbs: '', sugar: '', fiber: '', satFat: '', salt: '' },
    servingSize: '',
    servingLabel: '',
    packageSize: '',
  };
}

function formFromFood(food: Food): FormState {
  const v = (n: number | undefined) => toInputValue(n, 2);
  const incomplete = food.incomplete === true;
  // Num alimento incompleto, os zeros vieram de valores em falta: deixam-se vazios.
  const main = (n: number) => (incomplete && n === 0 ? '' : v(n));
  return {
    name: food.name,
    brand: food.brand ?? '',
    barcode: food.barcode ?? '',
    unit: food.unit,
    basis: 'per100',
    values: {
      kcal: main(food.per100.kcal),
      protein: main(food.per100.protein),
      fat: main(food.per100.fat),
      carbs: main(food.per100.carbs),
      sugar: v(food.per100.sugar),
      fiber: v(food.per100.fiber),
      satFat: v(food.per100.satFat),
      salt: v(food.per100.salt),
    },
    servingSize: v(food.servingSize),
    servingLabel: food.servingLabel ?? '',
    packageSize: v(food.packageSize),
  };
}

export function FoodEditorPage({
  foodId,
  barcode,
  initialName,
  then,
}: {
  foodId?: number;
  barcode?: string;
  initialName?: string;
  then?: { date: string; meal: MealId };
}) {
  const nav = useNav();
  const pageKey = usePageKey();
  const toast = useToast();
  const confirm = useConfirm();
  const existing = useLiveQuery(async () => (foodId != null ? ((await db.foods.get(foodId)) ?? null) : null), [foodId]);
  const [form, setForm] = useState<FormState | null>(foodId != null ? null : emptyForm(barcode, initialName));
  const [errors, setErrors] = useState<Errors>({});
  const [showExtras, setShowExtras] = useState(false);
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (existing && !form) {
      setForm(formFromFood(existing));
      setShowExtras(EXTRAS.some((x) => existing.per100[x.key] != null));
    }
  }, [existing, form]);

  if (!form) return <Page />;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm({ ...form, [key]: value });
    setErrors((e) => ({ ...e, [key]: undefined }));
  };
  const setValue = (key: NumKey, value: string) => {
    setForm({ ...form, values: { ...form.values, [key]: value } });
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const servingNum = parseDecimal(form.servingSize);
  const unitLabel = form.unit === 'ml' ? 'ml' : 'g';
  const basisLabel = form.basis === 'per100' ? `por 100 ${unitLabel}` : 'por porção';

  const macroKcal = (() => {
    const p = parseDecimal(form.values.protein);
    const f = parseDecimal(form.values.fat);
    const c = parseDecimal(form.values.carbs);
    if (p == null && f == null && c == null) return undefined;
    return kcalFromMacros({ protein: p ?? 0, fat: f ?? 0, carbs: c ?? 0 });
  })();

  /** Ao mudar entre "por 100 g" e "por porção", converte os valores já escritos. */
  const changeBasis = (basis: FormState['basis']) => {
    if (basis === form.basis) return;
    if (!servingNum) {
      setForm({ ...form, basis });
      if (basis === 'serving') setErrors((e) => ({ ...e, servingSize: 'Indica o tamanho da porção.' }));
      return;
    }
    const factor = basis === 'serving' ? servingNum / 100 : 100 / servingNum;
    const values = { ...form.values };
    for (const key of Object.keys(values) as NumKey[]) {
      const n = parseDecimal(values[key]);
      if (n != null) values[key] = toInputValue(n * factor, 2);
    }
    setForm({ ...form, basis, values });
  };

  const validate = (): { data: FoodData; errors: Errors } => {
    const errs: Errors = {};
    if (!form.name.trim()) errs.name = 'Dá um nome ao alimento.';

    const code = form.barcode.replace(/\D/g, '');
    if (form.barcode.trim() && !isValidGtin(code)) errs.barcode = 'Código de barras inválido (confirma os dígitos).';

    const serving = parseDecimal(form.servingSize);
    if (form.servingSize.trim() && (serving == null || serving <= 0)) errs.servingSize = 'Porção inválida.';
    if (form.basis === 'serving' && !serving) errs.servingSize = 'Indica o tamanho da porção.';
    const pkg = parseDecimal(form.packageSize);
    if (form.packageSize.trim() && (pkg == null || pkg <= 0)) errs.packageSize = 'Valor inválido.';

    const factor = form.basis === 'serving' && serving ? 100 / serving : 1;
    const read = (key: NumKey, required: boolean): number | undefined => {
      const raw = form.values[key];
      if (!raw.trim()) {
        if (required) errs[key] = 'Obrigatório.';
        return undefined;
      }
      const n = parseDecimal(raw);
      if (n == null || n < 0) {
        errs[key] = 'Número inválido.';
        return undefined;
      }
      return n * factor;
    };

    const per100: Nutrients = {
      kcal: read('kcal', true) ?? 0,
      protein: read('protein', false) ?? 0,
      fat: read('fat', false) ?? 0,
      carbs: read('carbs', false) ?? 0,
    };
    for (const { key } of EXTRAS) {
      const n = read(key, false);
      if (n != null) per100[key] = n;
    }

    return {
      errors: errs,
      data: {
        name: form.name,
        brand: form.brand,
        barcode: code || undefined,
        imageUrl: existing?.imageUrl,
        unit: form.unit,
        per100,
        servingSize: serving,
        servingLabel: form.servingLabel,
        packageSize: pkg,
        source: existing?.source ?? 'manual',
        incomplete: undefined,
      },
    };
  };

  const focusFirstError = () =>
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const { data, errors: errs } = validate();
    if (data.barcode) {
      const other = await findFoodByBarcode(data.barcode);
      if (other && other.id !== existing?.id) errs.barcode = `Este código já pertence a “${other.name}”.`;
    }
    setErrors(errs);
    if (Object.values(errs).some(Boolean)) {
      focusFirstError();
      return;
    }
    setBusy(true);
    try {
      if (existing) {
        await updateFood(existing.id, data);
        nav.pop();
        toast({ message: 'Alimento guardado' });
      } else {
        const id = await addFood(data);
        if (then) nav.replace({ name: 'log', foodId: id, date: then.date, meal: then.meal });
        else {
          nav.pop();
          toast({ message: 'Alimento criado' });
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'ConstraintError') {
        setErrors({ barcode: 'Já existe outro alimento com este código de barras.' });
        focusFirstError();
      } else {
        throw err;
      }
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!existing) return;
    const ok = await confirm({
      title: `Eliminar “${existing.name}”?`,
      message: 'Os registos que já fizeste no diário não são afetados.',
      confirmLabel: 'Eliminar',
      destructive: true,
    });
    if (!ok) return;
    await deleteFood(existing.id);
    nav.remove(pageKey);
    toast({ message: 'Alimento eliminado' });
  };

  const fieldError = (key: keyof Errors) =>
    errors[key] ? (
      <p id={`err-${key}`} className="field-error" role="alert">
        <Icon name="alert" size={14} /> {errors[key]}
      </p>
    ) : null;
  const invalid = (key: keyof Errors) => (errors[key] ? { 'aria-invalid': true, 'aria-describedby': `err-${key}` } : {});

  return (
    <Page>
      <PageHeader title={existing ? 'Editar alimento' : 'Novo alimento'} />
      <form ref={formRef} className="page-form" onSubmit={submit} noValidate>
        <div className="page-body">
          {existing?.incomplete && (
            <p className="notice notice-warning">
              <Icon name="alert" size={18} className="icon-warning" /> Faltam valores no Open Food Facts. Completa-os com o rótulo
              da embalagem.
            </p>
          )}

          <section className="card form-card">
            <div className="field">
              <label htmlFor="f-name">Nome</label>
              <input
                id="f-name"
                className="input"
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                autoComplete="off"
                enterKeyHint="next"
                required
                {...invalid('name')}
              />
              {fieldError('name')}
            </div>
            <div className="field">
              <label htmlFor="f-brand">
                Marca <span className="optional">(opcional)</span>
              </label>
              <input
                id="f-brand"
                className="input"
                value={form.brand}
                onChange={(e) => set('brand', e.target.value)}
                autoComplete="off"
                enterKeyHint="next"
              />
            </div>
            <div className="field">
              <label htmlFor="f-barcode">
                Código de barras <span className="optional">(opcional)</span>
              </label>
              <input
                id="f-barcode"
                className="input mono"
                inputMode="numeric"
                value={form.barcode}
                onChange={(e) => set('barcode', e.target.value.replace(/[^\d ]/g, ''))}
                onBlur={() => form.barcode.trim() && set('barcode', normalizeBarcode(form.barcode))}
                autoComplete="off"
                enterKeyHint="next"
                {...invalid('barcode')}
              />
              {fieldError('barcode')}
            </div>
            <div className="field">
              <span className="field-label">Medido em</span>
              <Choice
                name="unit"
                legend="Medido em"
                value={form.unit}
                onChange={(u) => set('unit', u)}
                options={[
                  { value: 'g', label: 'Gramas (g)' },
                  { value: 'ml', label: 'Mililitros (ml)' },
                ]}
              />
            </div>
          </section>

          <section className="card form-card" aria-labelledby="f-values-title">
            <div className="form-card-head">
              <h2 id="f-values-title">Informação nutricional</h2>
              <Choice
                name="basis"
                legend="Os valores são"
                className="choice-compact"
                value={form.basis}
                onChange={changeBasis}
                options={[
                  { value: 'per100', label: `100 ${unitLabel}` },
                  { value: 'serving', label: 'Porção' },
                ]}
              />
            </div>
            <p className="field-hint">Copia os valores do rótulo, {basisLabel}.</p>
            <div className="grid-2">
              {MAIN_FIELDS.map((f) => (
                <div className="field" key={f.key}>
                  <label htmlFor={`f-${f.key}`}>
                    {f.label} <span className="optional">({f.unit})</span>
                  </label>
                  <DecimalInput
                    id={`f-${f.key}`}
                    className="input"
                    value={form.values[f.key]}
                    onChange={(v) => setValue(f.key, v)}
                    enterKeyHint="next"
                    {...invalid(f.key)}
                  />
                  {fieldError(f.key)}
                </div>
              ))}
            </div>
            {!form.values.kcal.trim() && macroKcal != null && macroKcal > 0 && (
              <button type="button" className="btn btn-small" onClick={() => setValue('kcal', toInputValue(macroKcal, 0))}>
                Usar {fmtKcal(macroKcal)} kcal (calculado pelos macros)
              </button>
            )}
            {showExtras ? (
              <div className="grid-2">
                {EXTRAS.map((x) => (
                  <div className="field" key={x.key}>
                    <label htmlFor={`f-${x.key}`}>
                      {x.label} <span className="optional">(g)</span>
                    </label>
                    <DecimalInput
                      id={`f-${x.key}`}
                      className="input"
                      value={form.values[x.key]}
                      onChange={(v) => setValue(x.key, v)}
                      enterKeyHint="next"
                      {...invalid(x.key)}
                    />
                    {fieldError(x.key)}
                  </div>
                ))}
              </div>
            ) : (
              <button type="button" className="btn-ghost" onClick={() => setShowExtras(true)}>
                <Icon name="plus" size={18} /> Açúcares, fibra, gordura saturada e sal
              </button>
            )}
          </section>

          <section className="card form-card" aria-labelledby="f-portions-title">
            <h2 id="f-portions-title">Porções</h2>
            <div className="grid-2">
              <div className="field">
                <label htmlFor="f-serving">
                  Porção <span className="optional">({unitLabel})</span>
                </label>
                <DecimalInput
                  id="f-serving"
                  className="input"
                  value={form.servingSize}
                  onChange={(v) => set('servingSize', v)}
                  enterKeyHint="next"
                  {...invalid('servingSize')}
                />
                {fieldError('servingSize')}
              </div>
              <div className="field">
                <label htmlFor="f-package">
                  Embalagem <span className="optional">({unitLabel})</span>
                </label>
                <DecimalInput
                  id="f-package"
                  className="input"
                  value={form.packageSize}
                  onChange={(v) => set('packageSize', v)}
                  enterKeyHint="next"
                  {...invalid('packageSize')}
                />
                {fieldError('packageSize')}
              </div>
            </div>
            <div className="field">
              <label htmlFor="f-serving-label">
                Descrição da porção <span className="optional">(opcional, ex.: 2 fatias)</span>
              </label>
              <input
                id="f-serving-label"
                className="input"
                value={form.servingLabel}
                onChange={(e) => set('servingLabel', e.target.value)}
                autoComplete="off"
                enterKeyHint="done"
              />
            </div>
          </section>

          {existing && (
            <button type="button" className="btn btn-danger-ghost" onClick={remove}>
              <Icon name="trash" size={18} /> Eliminar alimento
            </button>
          )}
        </div>
        <div className="page-footer">
          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {existing ? 'Guardar alterações' : then ? 'Guardar e continuar' : 'Guardar alimento'}
          </button>
        </div>
      </form>
    </Page>
  );
}
