import { useLiveQuery } from 'dexie-react-hooks';
import { CalorieRing, MacroMeter } from '../components/charts';
import { useToast } from '../components/Feedback';
import { Icon } from '../components/Icon';
import { MacroInline, Thumb } from '../components/ui';
import { copyEntries, deleteEntries } from '../data';
import { db, MEALS, type Entry, type MealId, type Settings } from '../db';
import { addDays, formatLongDate, formatRelativeDay } from '../lib/dates';
import { fmtAmount, fmtKcal, MACROS, sumNutrients } from '../lib/nutrition';
import { displayBrand } from '../lib/text';
import { useNav } from '../nav';

interface Props {
  date: string;
  today: string;
  settings: Settings;
  /** `null` = acompanhar o dia de hoje. */
  onDateChange: (date: string | null) => void;
}

export function DiaryScreen({ date, today, settings, onDateChange }: Props) {
  const nav = useNav();
  const entries = useLiveQuery(() => db.entries.where('date').equals(date).sortBy('createdAt'), [date]);
  const previous = useLiveQuery(() => db.entries.where('date').equals(addDays(date, -1)).sortBy('createdAt'), [date]);

  const goTo = (d: string) => onDateChange(d === today ? null : d);
  const totals = sumNutrients((entries ?? []).map((e) => e.nutrients));
  const { goals } = settings;
  const remaining = goals.kcal - totals.kcal;

  return (
    <>
      <header className="diary-header">
        <button type="button" className="icon-btn" onClick={() => goTo(addDays(date, -1))} aria-label="Dia anterior">
          <Icon name="back" size={26} />
        </button>
        <div className="diary-date">
          <h1>{formatRelativeDay(date, today)}</h1>
          <p>{formatLongDate(date)}</p>
          <input
            className="date-overlay"
            type="date"
            aria-label="Escolher outro dia"
            value={date}
            onChange={(e) => e.target.value && goTo(e.target.value)}
            onClick={(e) => {
              try {
                e.currentTarget.showPicker?.();
              } catch {
                /* o iPhone abre o seletor sozinho */
              }
            }}
          />
        </div>
        <button type="button" className="icon-btn" onClick={() => goTo(addDays(date, 1))} aria-label="Dia seguinte">
          <Icon name="forward" size={26} />
        </button>
      </header>

      {date !== today && (
        <button type="button" className="pill-btn" onClick={() => onDateChange(null)}>
          <Icon name="calendar" size={16} /> Voltar a hoje
        </button>
      )}

      {!settings.goalsSet && (
        <section className="card notice">
          <Icon name="calculator" />
          <div>
            <p className="notice-title">Define os teus objetivos</p>
            <p className="notice-text">
              Estás a usar valores de exemplo ({fmtKcal(goals.kcal)} kcal). Calcula as tuas necessidades em 1 minuto.
            </p>
            <button type="button" className="btn btn-primary btn-small" onClick={() => nav.push({ name: 'goals' })}>
              Calcular objetivos
            </button>
          </div>
        </section>
      )}

      <section className="card summary" aria-label="Resumo do dia">
        <div className="summary-top">
          <div>
            <p className="hero">{fmtKcal(Math.abs(remaining))}</p>
            <p className="hero-label">
              {remaining >= 0 ? (
                'kcal restantes'
              ) : (
                <>
                  <Icon name="alert" size={16} className="icon-critical" /> kcal acima do objetivo
                </>
              )}
            </p>
            <p className="summary-sub">
              {fmtKcal(totals.kcal)} consumidas · objetivo {fmtKcal(goals.kcal)}
            </p>
          </div>
          <CalorieRing consumed={totals.kcal} target={goals.kcal} />
        </div>
        <div className="meters">
          {MACROS.map((m) => (
            <MacroMeter key={m.key} macro={m} value={totals[m.key]} target={goals[m.key]} />
          ))}
        </div>
      </section>

      {entries &&
        MEALS.map((meal) => (
          <MealCard
            key={meal.id}
            meal={meal.id}
            label={meal.label}
            date={date}
            entries={entries.filter((e) => e.meal === meal.id)}
            previous={(previous ?? []).filter((e) => e.meal === meal.id)}
          />
        ))}
    </>
  );
}

function MealCard({
  meal,
  label,
  date,
  entries,
  previous,
}: {
  meal: MealId;
  label: string;
  date: string;
  entries: Entry[];
  previous: Entry[];
}) {
  const nav = useNav();
  const toast = useToast();
  const total = sumNutrients(entries.map((e) => e.nutrients));
  const headingId = `meal-${meal}`;

  const copyPrevious = async () => {
    const ids = await copyEntries(previous, date, meal);
    toast({
      message: `${ids.length} ${ids.length === 1 ? 'alimento copiado' : 'alimentos copiados'} do dia anterior`,
      action: { label: 'Anular', run: () => void deleteEntries(ids) },
    });
  };

  return (
    <section className="card meal" aria-labelledby={headingId}>
      <header className="meal-header">
        <h2 id={headingId}>{label}</h2>
        {entries.length > 0 && <span className="meal-kcal">{fmtKcal(total.kcal)} kcal</span>}
      </header>
      {entries.length > 0 && <MacroInline n={total} />}
      {entries.length > 0 && (
        <ul className="list">
          {entries.map((e) => (
            <li key={e.id} className="row">
              <button
                type="button"
                className="row-main"
                onClick={() =>
                  nav.push(e.quick ? { name: 'quick', date, meal, entryId: e.id } : { name: 'entry', entryId: e.id })
                }
              >
                {e.quick ? (
                  <span className="thumb thumb-fallback" aria-hidden="true">
                    <Icon name="flame" size={20} />
                  </span>
                ) : (
                  <Thumb src={e.imageUrl} name={e.name} />
                )}
                <span className="row-text">
                  <span className="row-title">{e.name}</span>
                  <span className="row-meta">
                    {e.quick
                      ? 'Adição rápida'
                      : [displayBrand(e.name, e.brand), e.amount != null ? `${fmtAmount(e.amount)} ${e.unit ?? 'g'}` : null].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <span className="row-kcal">
                  <strong>{fmtKcal(e.nutrients.kcal)}</strong>
                  <span>kcal</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="meal-actions">
        <button type="button" className="btn-ghost" onClick={() => nav.push({ name: 'add', date, meal })}>
          <Icon name="plus" size={18} /> Adicionar
        </button>
        {entries.length === 0 && previous.length > 0 && (
          <button type="button" className="btn-ghost btn-ghost-muted" onClick={copyPrevious}>
            <Icon name="copy" size={18} /> Copiar do dia anterior
          </button>
        )}
      </div>
    </section>
  );
}
