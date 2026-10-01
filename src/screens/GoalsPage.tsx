import { useEffect, useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useToast } from '../components/Feedback';
import { Icon } from '../components/Icon';
import { Choice, DecimalInput, Page, PageHeader } from '../components/ui';
import { saveGoals } from '../data';
import { db, type Profile } from '../db';
import { useExpenditure, useSettings, useToday } from '../hooks';
import {
  ACTIVITY_LEVELS,
  computeGoals,
  DEFAULT_PROFILE,
  GOAL_OPTIONS,
  PROTEIN_OPTIONS,
  RATE_OPTIONS,
} from '../lib/goals';
import { fmtKcal, fmtNumber, MACROS, parseDecimal, toInputValue } from '../lib/nutrition';
import { useNav } from '../nav';

interface FormState {
  sex: Profile['sex'];
  age: string;
  heightCm: string;
  weightKg: string;
  activity: string;
  goal: Profile['goal'];
  rate: string;
  proteinPerKg: string;
  fatPct: string;
}

function toForm(p: Profile): FormState {
  return {
    sex: p.sex,
    age: String(p.age),
    heightCm: toInputValue(p.heightCm, 0),
    weightKg: toInputValue(p.weightKg),
    activity: String(p.activity),
    goal: p.goal,
    rate: String(p.ratePerWeek),
    proteinPerKg: String(p.proteinPerKg),
    fatPct: String(p.fatPct),
  };
}

function toProfile(f: FormState): Profile | null {
  const age = parseDecimal(f.age);
  const heightCm = parseDecimal(f.heightCm);
  const weightKg = parseDecimal(f.weightKg);
  if (!age || age < 14 || age > 100 || !heightCm || heightCm < 120 || heightCm > 230 || !weightKg || weightKg < 30 || weightKg > 300) {
    return null;
  }
  return {
    sex: f.sex,
    age,
    heightCm,
    weightKg,
    activity: Number(f.activity),
    goal: f.goal,
    ratePerWeek: Number(f.rate),
    proteinPerKg: Number(f.proteinPerKg),
    fatPct: Number(f.fatPct),
  };
}

export function GoalsPage() {
  const nav = useNav();
  const toast = useToast();
  const today = useToday();
  const settings = useSettings();
  const lastWeight = useLiveQuery(async () => (await db.weights.orderBy('date').last()) ?? null, []);
  const estimate = useExpenditure(today);
  const [form, setForm] = useState<FormState | null>(null);
  // Com dados suficientes, o gasto medido é a escolha por omissão (como no MacroFactor).
  const [sourceChoice, setSource] = useState<'formula' | 'data' | null>(null);
  const source = sourceChoice ?? (estimate ? 'data' : 'formula');

  useEffect(() => {
    if (form || !settings || lastWeight === undefined) return;
    const base = settings.profile ?? DEFAULT_PROFILE;
    setForm(toForm({ ...base, weightKg: lastWeight?.kg ?? base.weightKg }));
  }, [form, settings, lastWeight]);

  if (!form) return <Page />;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm({ ...form, [key]: value });
  const profile = toProfile(form);
  const useData = source === 'data' && estimate;
  const result = profile ? computeGoals(profile, useData ? estimate.tdee : undefined) : null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!profile || !result) return;
    await saveGoals(result.goals, profile);
    nav.pop();
    toast({ message: 'Objetivos atualizados' });
  };

  return (
    <Page>
      <PageHeader title="Calcular objetivos" />
      <form className="page-form" onSubmit={submit} noValidate>
        <div className="page-body">
          <section className="card form-card" aria-labelledby="about-you">
            <h2 id="about-you">Sobre ti</h2>
            <div className="field">
              <span className="field-label">Sexo</span>
              <Choice
                name="sex"
                legend="Sexo"
                value={form.sex}
                onChange={(v) => set('sex', v)}
                options={[
                  { value: 'm', label: 'Masculino' },
                  { value: 'f', label: 'Feminino' },
                ]}
              />
            </div>
            <div className="grid-3">
              <div className="field">
                <label htmlFor="p-age">Idade</label>
                <DecimalInput id="p-age" className="input" value={form.age} onChange={(v) => set('age', v)} />
              </div>
              <div className="field">
                <label htmlFor="p-height">Altura (cm)</label>
                <DecimalInput id="p-height" className="input" value={form.heightCm} onChange={(v) => set('heightCm', v)} />
              </div>
              <div className="field">
                <label htmlFor="p-weight">Peso (kg)</label>
                <DecimalInput id="p-weight" className="input" value={form.weightKg} onChange={(v) => set('weightKg', v)} />
              </div>
            </div>
            {!profile && <p className="field-error">Confirma a idade, a altura e o peso.</p>}
          </section>

          <section className="card form-card" aria-labelledby="activity-title">
            <h2 id="activity-title">Atividade</h2>
            <fieldset className="option-list">
              <legend className="visually-hidden">Nível de atividade</legend>
              {ACTIVITY_LEVELS.map((a) => (
                <label key={a.value}>
                  <input
                    type="radio"
                    name="activity"
                    value={a.value}
                    checked={form.activity === String(a.value)}
                    onChange={() => set('activity', String(a.value))}
                  />
                  <span>
                    <strong>{a.label}</strong>
                    <span>{a.hint}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          </section>

          <section className="card form-card" aria-labelledby="goal-title">
            <h2 id="goal-title">Objetivo</h2>
            <Choice name="goal" legend="Objetivo" value={form.goal} onChange={(v) => set('goal', v)} options={GOAL_OPTIONS.map((g) => ({ value: g.id, label: g.label }))} />
            {form.goal !== 'maintain' && (
              <div className="field">
                <span className="field-label">Ritmo por semana</span>
                <Choice
                  name="rate"
                  legend="Ritmo por semana"
                  value={form.rate}
                  onChange={(v) => set('rate', v)}
                  options={RATE_OPTIONS.map((r) => ({ value: String(r), label: `${fmtNumber(r, 2)} kg` }))}
                />
              </div>
            )}
            <div className="field">
              <span className="field-label">Proteína por kg de peso</span>
              <Choice
                name="protein"
                legend="Proteína por kg de peso"
                value={form.proteinPerKg}
                onChange={(v) => set('proteinPerKg', v)}
                options={PROTEIN_OPTIONS.map((p) => ({ value: String(p), label: `${fmtNumber(p)} g` }))}
              />
            </div>
            <div className="field">
              <span className="field-label">Gordura (% das calorias)</span>
              <Choice
                name="fat"
                legend="Gordura em percentagem das calorias"
                value={form.fatPct}
                onChange={(v) => set('fatPct', v)}
                options={['20', '25', '30', '35'].map((p) => ({ value: p, label: `${p}%` }))}
              />
            </div>
          </section>

          {estimate && (
            <section className="card form-card" aria-labelledby="source-title">
              <h2 id="source-title">Gasto diário</h2>
              <Choice
                name="source"
                legend="Calcular o gasto diário com"
                value={source}
                onChange={setSource}
                options={[
                  { value: 'formula', label: 'Fórmula' },
                  { value: 'data', label: 'Os teus dados' },
                ]}
              />
              <p className="field-hint">
                Pelos teus registos dos últimos 28 dias, gastas cerca de {fmtKcal(estimate.tdee)} kcal por dia. É normalmente
                mais exato do que a fórmula.
              </p>
            </section>
          )}

          {result && (
            <section className="card result" aria-labelledby="result-title" aria-live="polite">
              <h2 id="result-title">Resultado</h2>
              <dl className="result-list">
                <div>
                  <dt>Metabolismo basal</dt>
                  <dd>{fmtKcal(result.bmr)} kcal</dd>
                </div>
                <div>
                  <dt>Gasto diário {useData ? '(os teus dados)' : '(estimado)'}</dt>
                  <dd>{fmtKcal(result.tdee)} kcal</dd>
                </div>
                <div className="result-main">
                  <dt>Objetivo diário</dt>
                  <dd>{fmtKcal(result.goals.kcal)} kcal</dd>
                </div>
                {MACROS.map((m) => (
                  <div key={m.key}>
                    <dt>
                      <span className={`dot dot-${m.key}`} aria-hidden="true" /> {m.label}
                    </dt>
                    <dd>{fmtNumber(result.goals[m.key], 0)} g</dd>
                  </div>
                ))}
              </dl>
              {result.clamped && (
                <p className="field-hint hint-warning">
                  <Icon name="alert" size={14} className="icon-warning" /> Ajustado para o mínimo recomendado. Para perder peso
                  mais depressa fala com um profissional de saúde.
                </p>
              )}
            </section>
          )}
        </div>
        <div className="page-footer">
          <button type="submit" className="btn btn-primary btn-block" disabled={!result}>
            Aplicar objetivos
          </button>
        </div>
      </form>
    </Page>
  );
}
