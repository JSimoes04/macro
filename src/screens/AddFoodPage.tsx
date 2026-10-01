import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useToast } from '../components/Feedback';
import { Icon } from '../components/Icon';
import { Choice, EmptyState, FoodRow, Page, PageHeader } from '../components/ui';
import { defaultAmount, deleteEntry, logFood } from '../data';
import { db, mealLabel, type Food, type MealId } from '../db';
import { fmtAmount } from '../lib/nutrition';
import { byName, byRecent, searchFoods } from '../lib/search';
import { useNav } from '../nav';

type ListTab = 'recent' | 'favorites' | 'all';

export function AddFoodPage({ date, meal }: { date: string; meal: MealId }) {
  const nav = useNav();
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<ListTab>('recent');
  const foods = useLiveQuery(() => db.foods.toArray(), []);

  const list = useMemo(() => {
    if (!foods) return [];
    if (query.trim()) return searchFoods(foods, query);
    if (tab === 'recent') return foods.filter((f) => f.lastUsedAt > 0).sort(byRecent).slice(0, 60);
    if (tab === 'favorites') return foods.filter((f) => f.favorite === 1).sort(byName);
    return [...foods].sort(byName);
  }, [foods, query, tab]);

  const quickLog = async (food: Food) => {
    const amount = defaultAmount(food);
    const id = await logFood(food, amount, date, meal);
    toast({
      message: `${food.name} · ${fmtAmount(amount)} ${food.unit} adicionado`,
      action: { label: 'Anular', run: () => void deleteEntry(id) },
    });
  };

  const empty = () => {
    if (!foods) return null;
    if (query.trim()) {
      return (
        <EmptyState icon="search" title={`Nada encontrado para “${query.trim()}”`}>
          <p>Lê o código de barras do produto ou cria o alimento com os valores do rótulo.</p>
          <button
            type="button"
            className="btn btn-small"
            onClick={() => nav.push({ name: 'food', initialName: query.trim(), then: { date, meal } })}
          >
            Criar “{query.trim()}”
          </button>
        </EmptyState>
      );
    }
    if (foods.length === 0) {
      return (
        <EmptyState icon="barcode" title="Ainda não tens alimentos">
          <p>Lê o código de barras de um produto: fica guardado e da próxima vez aparece aqui, mesmo sem internet.</p>
        </EmptyState>
      );
    }
    if (tab === 'favorites') {
      return (
        <EmptyState icon="star" title="Sem favoritos">
          <p>Toca na estrela ao ver um alimento para o fixares aqui.</p>
        </EmptyState>
      );
    }
    return <EmptyState icon="foods" title="Ainda não registaste nada" />;
  };

  return (
    <Page>
      <PageHeader title={`Adicionar · ${mealLabel(meal)}`} />
      <div className="page-body">
        <search className="search-box">
          <Icon name="search" size={18} />
          <input
            type="search"
            placeholder="Procurar nos teus alimentos"
            aria-label="Procurar nos teus alimentos"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            enterKeyHint="search"
            autoComplete="off"
          />
        </search>

        <div className="action-grid">
          <button type="button" onClick={() => nav.push({ name: 'scan', date, meal })}>
            <Icon name="barcode" />
            Ler código
          </button>
          <button type="button" onClick={() => nav.push({ name: 'quick', date, meal })}>
            <Icon name="flame" />
            Adição rápida
          </button>
          <button type="button" onClick={() => nav.push({ name: 'food', then: { date, meal } })}>
            <Icon name="plus" />
            Criar alimento
          </button>
        </div>

        {!query.trim() && (
          <Choice
            name="add-list"
            legend="Mostrar"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'recent', label: 'Recentes' },
              { value: 'favorites', label: 'Favoritos' },
              { value: 'all', label: 'Todos' },
            ]}
          />
        )}

        {list.length > 0 ? (
          <ul className="card list list-card">
            {list.map((f) => (
              <FoodRow
                key={f.id}
                food={f}
                onOpen={() => nav.push({ name: 'log', foodId: f.id, date, meal })}
                onQuickAdd={() => void quickLog(f)}
              />
            ))}
          </ul>
        ) : (
          empty()
        )}
      </div>
    </Page>
  );
}
