import { useMemo, useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { CaloriesChart, MacroMeter, WeightChart, type CalorieBar } from '../components/charts';
import { useConfirm, useToast } from '../components/Feedback';
import { Icon } from '../components/Icon';
import { Choice, DecimalInput } from '../components/ui';
import { deleteWeight, setWeight } from '../data';
import { db, type Settings } from '../db';
import { addDays, dateRange, diffDays, formatShortDate } from '../lib/dates';
import { useDailyTotals, useExpenditure } from '../hooks';
import { fmtKcal, fmtNumber, MACROS, parseDecimal, sumNutrients, toInputValue, type Nutrients } from '../lib/nutrition';
import { computeTrend, KCAL_PER_KG, MIN_LOGGED_DAYS } from '../lib/trend';
import { useNav } from '../nav';

type RangeId = '7' | '30' | '90' | '365';
const RANGES: { value: RangeId; label: string }[] = [
  { value: '7', label: '7 dias' },
  { value: '30', label: '30 dias' },
  { value: '90', label: '3 meses' },
  { value: '365', label: '1 ano' },
];

export function ProgressScreen({ today, settings }: { today: string; settings: Settings }) {
  const [range, setRange] = useState<RangeId>('30');
  const days = Number(range);
  const start = addDays(today, -(days - 1));

  return (
    <>
      <header className="tab-header">
        <h1>Progresso</h1>
      </header>
      <Choice name="range" legend="Período" value={range} onChange={setRange} options={RANGES} />
      <WeightCard today={today} start={start} days={days} />
      <NutritionCards today={today} start={start} days={days} settings={settings} />
      <ExpenditureCard today={today} />
    </>
  );
}

/* ---------- Peso ---------- */

function WeightCard({ today, start, days }: { today: string; start: string; days: number }) {
  const toast = useToast();
  const confirm = useConfirm();
  const weights = useLiveQuery(() => db.weights.orderBy('date').toArray(), []);
  const [date, setDate] = useState(today);
  const [input, setInput] = useState('');
  const [error, setError] = useState('');

  const trend = useMemo(() => computeTrend(weights ?? []), [weights]);
  const inRange = trend.filter((p) => p.date >= start && p.date <= today);
  const last = trend.at(-1);
  const before = [...trend].reverse().find((p) => p.date < start);
  const base = before ?? inRange[0];
  const change = last && base && base !== last ? last.trend - base.trend : null;
  const spanDays = last && base ? Math.max(1, diffDays(base.date, last.date)) : 0;
  const existing = weights?.find((w) => w.date === date);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const kg = parseDecimal(input);
    if (kg == null || kg < 20 || kg > 400) {
      setError('Indica um peso entre 20 e 400 kg.');
      return;
    }
    await setWeight(date, kg);
    setInput('');
    toast({ message: `Peso de ${fmtNumber(kg)} kg guardado` });
  };

  const remove = async (d: string) => {
    if (await confirm({ title: `Apagar a pesagem de ${formatShortDate(d)}?`, confirmLabel: 'Apagar', destructive: true })) {
      await deleteWeight(d);
    }
  };

  return (
    <section className="card" aria-labelledby="weight-title">
      <h2 id="weight-title">Peso</h2>
      <form className="weight-form" onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="w-kg">Pesagem (kg)</label>
          <DecimalInput
            id="w-kg"
            className="input"
            value={input}
            placeholder={existing ? toInputValue(existing.kg) : last ? toInputValue(last.kg) : '75,0'}
            onChange={(v) => {
              setInput(v);
              setError('');
            }}
            enterKeyHint="done"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'w-error' : undefined}
          />
        </div>
        <div className="field">
          <label htmlFor="w-date">Dia</label>
          <input
            id="w-date"
            className="input"
            type="date"
            value={date}
            max={today}
            onChange={(e) => e.target.value && setDate(e.target.value)}
          />
        </div>
        <button type="submit" className="btn btn-primary">
          {existing ? 'Atualizar' : 'Guardar'}
        </button>
        {error && (
          <p id="w-error" className="field-error weight-error" role="alert">
            {error}
          </p>
        )}
      </form>

      {last ? (
        <>
          <div className="stats">
            <div>
              <p className="stat-label">Peso de tendência</p>
              <p className="stat-value">{fmtNumber(last.trend)} kg</p>
            </div>
            {change != null && (
              <div>
                <p className="stat-label">Variação no período</p>
                <p className="stat-value stat-delta">
                  <Icon name={change < -0.05 ? 'arrowDown' : change > 0.05 ? 'arrowUp' : 'minus'} size={18} />
                  {fmtNumber(Math.abs(change))} kg
                </p>
                <p className="stat-note">{fmtNumber((change / spanDays) * 7, 2)} kg por semana</p>
              </div>
            )}
          </div>
          {inRange.length > 0 ? (
            <>
              <div className="legend" aria-hidden="true">
                <span>
                  <span className="key-dot" /> Pesagem
                </span>
                <span>
                  <span className="key-line" /> Tendência
                </span>
              </div>
              <WeightChart points={inRange} start={start} end={today} />
            </>
          ) : (
            <p className="muted">Sem pesagens neste período.</p>
          )}
          <details className="chart-table">
            <summary>Ver pesagens</summary>
            <table>
              <thead>
                <tr>
                  <th scope="col">Dia</th>
                  <th scope="col">Peso</th>
                  <th scope="col">Tendência</th>
                  <th scope="col">
                    <span className="visually-hidden">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {[...trend]
                  .reverse()
                  .slice(0, days)
                  .map((p) => (
                    <tr key={p.date}>
                      <td>{formatShortDate(p.date)}</td>
                      <td>{fmtNumber(p.kg)}</td>
                      <td>{fmtNumber(p.trend)}</td>
                      <td>
                        <button
                          type="button"
                          className="icon-btn icon-btn-small"
                          aria-label={`Apagar pesagem de ${formatShortDate(p.date)}`}
                          onClick={() => void remove(p.date)}
                        >
                          <Icon name="trash" size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </details>
        </>
      ) : (
        <p className="muted">
          Pesa-te de manhã, depois da casa de banho e antes de comer. A tendência filtra as oscilações diárias de água e sal.
        </p>
      )}
    </section>
  );
}

/* ---------- Calorias e macros ---------- */

function NutritionCards({ today, start, days, settings }: { today: string; start: string; days: number; settings: Settings }) {
  const totals = useDailyTotals(start, today);
  const { goals } = settings;

  const { bars, weekly, logged, avg } = useMemo(() => {
    const all = dateRange(start, today);
    const map = totals ?? new Map<string, Nutrients>();
    const loggedDays = all.filter((d) => (map.get(d)?.kcal ?? 0) > 0);
    const sum = sumNutrients(loggedDays.map((d) => map.get(d)!));
    const n = loggedDays.length || 1;
    const average = { kcal: sum.kcal / n, protein: sum.protein / n, fat: sum.fat / n, carbs: sum.carbs / n };

    const isWeekly = days > 31;
    let result: CalorieBar[];
    if (!isWeekly) {
      result = all.map((d) => ({ date: d, kcal: map.get(d)?.kcal ?? null }));
    } else {
      result = [];
      for (let i = 0; i < all.length; i += 7) {
        const week = all.slice(i, i + 7).filter((d) => (map.get(d)?.kcal ?? 0) > 0);
        const kcal = week.length ? week.reduce((s, d) => s + map.get(d)!.kcal, 0) / week.length : null;
        result.push({ date: all[i], kcal });
      }
    }
    return { bars: result, weekly: isWeekly, logged: loggedDays.length, avg: average };
  }, [totals, start, today, days]);

  if (!totals) return null;

  return (
    <>
      <section className="card" aria-labelledby="kcal-title">
        <h2 id="kcal-title">Calorias</h2>
        {logged > 0 ? (
          <>
            <div className="stats">
              <div>
                <p className="stat-label">Média diária</p>
                <p className="stat-value">{fmtKcal(avg.kcal)} kcal</p>
                <p className="stat-note">
                  em {logged} {logged === 1 ? 'dia registado' : 'dias registados'}
                </p>
              </div>
              <div>
                <p className="stat-label">Objetivo</p>
                <p className="stat-value">{fmtKcal(goals.kcal)} kcal</p>
                <p className="stat-note">
                  {avg.kcal > goals.kcal ? '+' : '−'}
                  {fmtKcal(Math.abs(avg.kcal - goals.kcal))} kcal em média
                </p>
              </div>
            </div>
            <CaloriesChart bars={bars} target={goals.kcal} weekly={weekly} />
            <details className="chart-table">
              <summary>Ver dados</summary>
              <table>
                <thead>
                  <tr>
                    <th scope="col">{weekly ? 'Semana de' : 'Dia'}</th>
                    <th scope="col">{weekly ? 'Média (kcal)' : 'Calorias'}</th>
                  </tr>
                </thead>
                <tbody>
                  {[...bars].reverse().map((b) => (
                    <tr key={b.date}>
                      <td>{formatShortDate(b.date)}</td>
                      <td>{b.kcal ? fmtKcal(b.kcal) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </>
        ) : (
          <p className="muted">Ainda não há refeições registadas neste período.</p>
        )}
      </section>

      {logged > 0 && (
        <section className="card" aria-labelledby="macros-title">
          <h2 id="macros-title">Macros (média diária)</h2>
          <div className="meters">
            {MACROS.map((m) => (
              <MacroMeter key={m.key} macro={m} value={avg[m.key]} target={goals[m.key]} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}

/* ---------- Gasto energético estimado ---------- */

function ExpenditureCard({ today }: { today: string }) {
  const nav = useNav();
  const estimate = useExpenditure(today);
  if (estimate === undefined) return null;

  return (
    <section className="card" aria-labelledby="tdee-title">
      <h2 id="tdee-title">Gasto energético estimado</h2>
      {estimate ? (
        <>
          <p className="stat-value stat-value-big">{fmtKcal(estimate.tdee)} kcal/dia</p>
          <p className="muted">
            Nos últimos {estimate.windowDays} dias comeste em média {fmtKcal(estimate.avgIntake)} kcal (
            {estimate.loggedDays} dias registados) e o peso de tendência variou {estimate.deltaKg > 0 ? '+' : '−'}
            {fmtNumber(Math.abs(estimate.deltaKg), 2)} kg. Como 1 kg ≈ {fmtKcal(KCAL_PER_KG)} kcal, o teu gasto real é cerca de{' '}
            {fmtKcal(estimate.tdee)} kcal por dia.
          </p>
          <button type="button" className="btn btn-small" onClick={() => nav.push({ name: 'goals' })}>
            <Icon name="calculator" size={18} /> Ajustar objetivos
          </button>
        </>
      ) : (
        <p className="muted">
          Calculado a partir do que comes e da variação do teu peso, como no MacroFactor. Precisa de pelo menos {MIN_LOGGED_DAYS}{' '}
          dias com comida registada e duas pesagens com uma semana de intervalo, nos últimos 28 dias.
        </p>
      )}
    </section>
  );
}
