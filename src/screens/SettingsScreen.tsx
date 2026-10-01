import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useConfirm, useToast } from '../components/Feedback';
import { Icon } from '../components/Icon';
import { DecimalInput } from '../components/ui';
import { saveGoals } from '../data';
import type { Goals, Settings } from '../db';
import { isIOS, isStandalone } from '../hooks';
import { buildBackup, clearAllData, restoreBackup, shareFile } from '../lib/backup';
import { formatShortDate, todayISO } from '../lib/dates';
import { fmtKcal, kcalFromMacros, MACROS, parseDecimal, toInputValue } from '../lib/nutrition';
import { useNav } from '../nav';

export function SettingsScreen({ settings }: { settings: Settings }) {
  return (
    <>
      <header className="tab-header">
        <h1>Definições</h1>
      </header>
      <GoalsForm key={JSON.stringify(settings.goals)} goals={settings.goals} />
      {!isStandalone() && <InstallCard />}
      <BackupCard />
      <AboutCard />
    </>
  );
}

function GoalsForm({ goals }: { goals: Goals }) {
  const nav = useNav();
  const toast = useToast();
  const [values, setValues] = useState({
    kcal: toInputValue(goals.kcal, 0),
    protein: toInputValue(goals.protein, 0),
    fat: toInputValue(goals.fat, 0),
    carbs: toInputValue(goals.carbs, 0),
  });
  const [error, setError] = useState('');

  const parsed = {
    kcal: parseDecimal(values.kcal),
    protein: parseDecimal(values.protein),
    fat: parseDecimal(values.fat),
    carbs: parseDecimal(values.carbs),
  };
  const macroKcal =
    parsed.protein != null && parsed.fat != null && parsed.carbs != null
      ? kcalFromMacros({ protein: parsed.protein, fat: parsed.fat, carbs: parsed.carbs })
      : undefined;
  const mismatch = macroKcal != null && parsed.kcal != null && Math.abs(macroKcal - parsed.kcal) > 50;
  const dirty = (Object.keys(values) as (keyof Goals)[]).some((k) => parsed[k] !== goals[k]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (Object.values(parsed).some((v) => v == null || v < 0) || !parsed.kcal) {
      setError('Preenche todos os valores.');
      return;
    }
    await saveGoals({ kcal: parsed.kcal, protein: parsed.protein!, fat: parsed.fat!, carbs: parsed.carbs! });
    toast({ message: 'Objetivos guardados' });
  };

  return (
    <section className="card form-card" aria-labelledby="goals-title">
      <h2 id="goals-title">Objetivos diários</h2>
      <form onSubmit={submit} noValidate className="form-stack">
        <div className="field">
          <label htmlFor="g-kcal">Calorias (kcal)</label>
          <DecimalInput
            id="g-kcal"
            className="input"
            value={values.kcal}
            onChange={(v) => {
              setValues({ ...values, kcal: v });
              setError('');
            }}
            enterKeyHint="next"
          />
        </div>
        <div className="grid-3">
          {MACROS.map((m) => (
            <div className="field" key={m.key}>
              <label htmlFor={`g-${m.key}`}>
                <span className={`dot dot-${m.key}`} aria-hidden="true" /> {m.label} (g)
              </label>
              <DecimalInput
                id={`g-${m.key}`}
                className="input"
                value={values[m.key]}
                onChange={(v) => {
                  setValues({ ...values, [m.key]: v });
                  setError('');
                }}
                enterKeyHint="next"
              />
            </div>
          ))}
        </div>
        {macroKcal != null && (
          <p className={mismatch ? 'field-hint hint-warning' : 'field-hint'}>
            {mismatch && <Icon name="alert" size={14} className="icon-warning" />} Os macros somam {fmtKcal(macroKcal)} kcal
            {mismatch ? ' — diferente do objetivo de calorias.' : '.'}
          </p>
        )}
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <div className="button-row">
          <button type="button" className="btn" onClick={() => nav.push({ name: 'goals' })}>
            <Icon name="calculator" size={18} /> Calcular
          </button>
          <button type="submit" className="btn btn-primary" disabled={!dirty}>
            Guardar
          </button>
        </div>
      </form>
    </section>
  );
}

function InstallCard() {
  return (
    <section className="card" aria-labelledby="install-title">
      <h2 id="install-title">Instalar no iPhone</h2>
      {isIOS() ? (
        <ol className="steps">
          <li>
            Abre esta página no <strong>Safari</strong>.
          </li>
          <li>
            Toca em <Icon name="share" size={16} className="inline-icon" /> <strong>Partilhar</strong>.
          </li>
          <li>
            Escolhe <strong>Adicionar ao ecrã principal</strong>.
          </li>
        </ol>
      ) : (
        <p className="muted">Abre esta página no Safari do iPhone e escolhe Partilhar › Adicionar ao ecrã principal.</p>
      )}
      <p className="muted">
        A app passa a abrir em ecrã inteiro e funciona sem internet. Atenção: a app instalada tem dados próprios, separados
        dos do Safari.
      </p>
    </section>
  );
}

function BackupCard() {
  const toast = useToast();
  const confirm = useConfirm();
  const fileInput = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<File | null>(null);
  const [lastBackup, setLastBackup] = useState(readLastBackup);

  const exportData = async () => {
    const file = pending ?? (await buildBackup());
    try {
      const result = await shareFile(file);
      setPending(null);
      if (result !== 'cancelled') setLastBackup(writeLastBackup());
      if (result === 'downloaded') toast({ message: 'Cópia de segurança descarregada' });
    } catch {
      // O iOS só abre a partilha logo a seguir a um toque: o ficheiro fica pronto para um segundo toque.
      setPending(file);
    }
  };

  const importData = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const ok = await confirm({
      title: 'Repor cópia de segurança?',
      message: 'Todos os dados atuais deste iPhone são substituídos pelos do ficheiro.',
      confirmLabel: 'Repor',
      destructive: true,
    });
    if (!ok) return;
    try {
      const summary = await restoreBackup(file);
      const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
      toast({
        message: `Reposto: ${n(summary.foods, 'alimento', 'alimentos')}, ${n(summary.entries, 'registo', 'registos')}, ${n(summary.weights, 'pesagem', 'pesagens')}`,
      });
    } catch (err) {
      toast({ message: err instanceof Error ? err.message : 'Não foi possível ler o ficheiro.' });
    }
  };

  const wipe = async () => {
    const ok = await confirm({
      title: 'Apagar todos os dados?',
      message: 'Alimentos, diário, pesagens e objetivos. Faz primeiro uma cópia de segurança se os quiseres guardar.',
      confirmLabel: 'Apagar tudo',
      destructive: true,
    });
    if (!ok) return;
    await clearAllData();
    toast({ message: 'Dados apagados' });
  };

  return (
    <section className="card" aria-labelledby="backup-title">
      <h2 id="backup-title">Cópia de segurança</h2>
      <p className="muted">
        Os dados ficam guardados só neste iPhone. Exporta uma cópia de vez em quando (por exemplo para a app Ficheiros ou o
        iCloud Drive) para não os perderes se apagares a app.
      </p>
      <p className="muted">
        Última cópia: <strong>{lastBackup ? formatShortDate(lastBackup) : 'nunca'}</strong>
      </p>
      <div className="button-row">
        <button type="button" className="btn" onClick={() => void exportData()}>
          <Icon name="share" size={18} /> {pending ? 'Partilhar ficheiro' : 'Exportar'}
        </button>
        <button type="button" className="btn" onClick={() => fileInput.current?.click()}>
          <Icon name="upload" size={18} /> Repor
        </button>
      </div>
      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        className="visually-hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => void importData(e)}
      />
      <button type="button" className="btn btn-danger-ghost" onClick={() => void wipe()}>
        <Icon name="trash" size={18} /> Apagar todos os dados
      </button>
    </section>
  );
}

const LAST_BACKUP_KEY = 'macro:last-backup';

function readLastBackup(): string | null {
  try {
    return localStorage.getItem(LAST_BACKUP_KEY);
  } catch {
    return null;
  }
}

function writeLastBackup(): string {
  const today = todayISO();
  try {
    localStorage.setItem(LAST_BACKUP_KEY, today);
  } catch {
    /* sem armazenamento: só não fica lembrado */
  }
  return today;
}

function AboutCard() {
  return (
    <section className="card about" aria-labelledby="about-title">
      <h2 id="about-title">Sobre</h2>
      <p className="muted">
        Macro {__APP_VERSION__} · uso pessoal. Os dados dos produtos vêm do{' '}
        <a href="https://world.openfoodfacts.org" target="_blank" rel="noreferrer">
          Open Food Facts
        </a>
        , uma base de dados aberta e colaborativa (licença ODbL). Os valores podem conter erros: confirma com o rótulo quando
        tiveres dúvidas.
      </p>
    </section>
  );
}
