import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Icon } from '../components/Icon';
import { Choice, EmptyState, FoodRow } from '../components/ui';
import { db, mealForTime } from '../db';
import { byName, byRecent, byUse, searchFoods } from '../lib/search';
import { useNav } from '../nav';

type Sort = 'recent' | 'used' | 'name';

export function FoodsScreen({ date }: { date: string }) {
  const nav = useNav();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('recent');
  const foods = useLiveQuery(() => db.foods.toArray(), []);

  const list = useMemo(() => {
    if (!foods) return [];
    if (query.trim()) return searchFoods(foods, query);
    const sorter = sort === 'recent' ? byRecent : sort === 'used' ? byUse : byName;
    return [...foods].sort(sorter);
  }, [foods, query, sort]);

  return (
    <>
      <header className="tab-header">
        <h1>Alimentos</h1>
        <button type="button" className="btn btn-small" onClick={() => nav.push({ name: 'food' })}>
          <Icon name="plus" size={18} /> Novo
        </button>
      </header>
      <p className="tab-sub">
        {foods ? `${foods.length} ${foods.length === 1 ? 'alimento guardado' : 'alimentos guardados'} neste iPhone` : ' '}
      </p>

      <search className="search-box">
        <Icon name="search" size={18} />
        <input
          type="search"
          placeholder="Procurar por nome, marca ou código"
          aria-label="Procurar alimentos"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          enterKeyHint="search"
          autoComplete="off"
        />
      </search>

      {!query.trim() && (
        <Choice
          name="foods-sort"
          legend="Ordenar"
          value={sort}
          onChange={setSort}
          options={[
            { value: 'recent', label: 'Recentes' },
            { value: 'used', label: 'Mais usados' },
            { value: 'name', label: 'A–Z' },
          ]}
        />
      )}

      {list.length > 0 ? (
        <ul className="card list list-card">
          {list.map((f) => (
            <FoodRow
              key={f.id}
              food={f}
              onOpen={() => nav.push({ name: 'log', foodId: f.id, date, meal: mealForTime() })}
            />
          ))}
        </ul>
      ) : foods && query.trim() ? (
        <EmptyState icon="search" title={`Nada encontrado para “${query.trim()}”`} />
      ) : foods ? (
        <EmptyState icon="barcode" title="Ainda não tens alimentos">
          <p>Usa o botão do código de barras em baixo. Cada produto lido fica guardado aqui para a próxima vez.</p>
        </EmptyState>
      ) : null}
    </>
  );
}
