import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { FeedbackProvider } from './components/Feedback';
import { Icon, type IconName } from './components/Icon';
import { mealForTime } from './db';
import { useSettings, useToday } from './hooks';
import { NavProvider, PageKeyProvider, useNavStack, type Page } from './nav';
import { AddFoodPage } from './screens/AddFoodPage';
import { DiaryScreen } from './screens/DiaryScreen';
import { FoodEditorPage } from './screens/FoodEditorPage';
import { FoodsScreen } from './screens/FoodsScreen';
import { GoalsPage } from './screens/GoalsPage';
import { EntryPage, LogFoodPage } from './screens/LogFoodPage';
import { ProgressScreen } from './screens/ProgressScreen';
import { QuickAddPage } from './screens/QuickAddPage';
import { ScannerPage } from './screens/ScannerPage';
import { SettingsScreen } from './screens/SettingsScreen';

type Tab = 'diary' | 'foods' | 'progress' | 'settings';

const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'diary', label: 'Diário', icon: 'diary' },
  { id: 'foods', label: 'Alimentos', icon: 'foods' },
  { id: 'progress', label: 'Progresso', icon: 'progress' },
  { id: 'settings', label: 'Definições', icon: 'settings' },
];

export default function App() {
  const { stack, nav } = useNavStack();
  const [tab, setTab] = useState<Tab>('diary');
  const today = useToday();
  // `null` = o diário acompanha o dia de hoje (também depois da meia-noite).
  const [diaryDate, setDiaryDate] = useState<string | null>(null);
  const date = diaryDate ?? today;
  const settings = useSettings();

  useEffect(() => {
    // Pede ao Safari para não apagar a base de dados quando falta espaço.
    navigator.storage
      ?.persisted?.()
      .then((persisted) => persisted || navigator.storage.persist())
      .catch(() => {});
  }, []);

  const changeTab = (next: Tab) => {
    setTab(next);
    window.scrollTo(0, 0);
  };

  const renderTab = (t: (typeof TABS)[number]) => (
    <button
      key={t.id}
      type="button"
      aria-current={tab === t.id ? 'page' : undefined}
      onClick={() => changeTab(t.id)}
    >
      <Icon name={t.icon} />
      <span>{t.label}</span>
    </button>
  );

  return (
    <NavProvider value={nav}>
      <FeedbackProvider>
        <div className="tabs" hidden={stack.length > 0}>
          <main className="tab-view">
            {settings && tab === 'diary' && (
              <DiaryScreen date={date} today={today} settings={settings} onDateChange={setDiaryDate} />
            )}
            {tab === 'foods' && <FoodsScreen date={date} />}
            {settings && tab === 'progress' && <ProgressScreen today={today} settings={settings} />}
            {settings && tab === 'settings' && <SettingsScreen settings={settings} />}
          </main>
          <nav className="tabbar" aria-label="Separadores">
            {TABS.slice(0, 2).map(renderTab)}
            <button
              type="button"
              className="tabbar-scan"
              aria-label="Ler código de barras"
              onClick={() => nav.push({ name: 'scan', date, meal: mealForTime() })}
            >
              <Icon name="barcode" size={26} />
            </button>
            {TABS.slice(2).map(renderTab)}
          </nav>
        </div>

        {stack.map((item, i) => (
          <PageKeyProvider key={item.key} value={item.key}>
            <div className="page-host" hidden={i !== stack.length - 1}>
              <PageView page={item.page} />
            </div>
          </PageKeyProvider>
        ))}

        <UpdatePrompt />
      </FeedbackProvider>
    </NavProvider>
  );
}

function PageView({ page }: { page: Page }) {
  switch (page.name) {
    case 'add':
      return <AddFoodPage date={page.date} meal={page.meal} />;
    case 'scan':
      return <ScannerPage date={page.date} meal={page.meal} />;
    case 'log':
      return <LogFoodPage foodId={page.foodId} date={page.date} meal={page.meal} scanned={page.scanned} />;
    case 'entry':
      return <EntryPage entryId={page.entryId} />;
    case 'food':
      return <FoodEditorPage foodId={page.foodId} barcode={page.barcode} initialName={page.initialName} then={page.then} />;
    case 'quick':
      return <QuickAddPage date={page.date} meal={page.meal} entryId={page.entryId} />;
    case 'goals':
      return <GoalsPage />;
  }
}

/** Aviso discreto quando há uma versão nova publicada. */
function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (registration) setInterval(() => registration.update().catch(() => {}), 60 * 60 * 1000);
    },
  });
  if (!needRefresh) return null;
  return (
    <div className="update-banner" role="status">
      <span>Há uma versão nova da app.</span>
      <button type="button" className="btn btn-small btn-primary" onClick={() => void updateServiceWorker(true)}>
        Atualizar
      </button>
      <button type="button" className="icon-btn icon-btn-small" aria-label="Agora não" onClick={() => setNeedRefresh(false)}>
        <Icon name="close" size={18} />
      </button>
    </div>
  );
}
