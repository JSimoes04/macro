import { useEffect, useState, type CSSProperties, type InputHTMLAttributes, type ReactNode } from 'react';
import { MEALS, type Food, type MealId } from '../db';
import { defaultAmount } from '../data';
import { fmtAmount, fmtGrams, fmtKcal, MACROS, type Nutrients } from '../lib/nutrition';
import { displayBrand } from '../lib/text';
import { useNav } from '../nav';
import { Icon, type IconName } from './Icon';

/** Ecrã empilhado: entra a deslizar da direita na primeira vez que aparece. */
export function Page({ children, className = '' }: { children?: ReactNode; className?: string }) {
  const [entering, setEntering] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setEntering(false), 400);
    return () => clearTimeout(t);
  }, []);
  return <div className={`page ${entering ? 'page-enter' : ''} ${className}`}>{children}</div>;
}

export function PageHeader({ title, actions }: { title: string; actions?: ReactNode }) {
  const nav = useNav();
  return (
    <header className="page-header">
      <button type="button" className="icon-btn" onClick={nav.pop} aria-label="Voltar">
        <Icon name="back" size={26} />
      </button>
      <h1>{title}</h1>
      <div className="page-header-actions">{actions}</div>
    </header>
  );
}

export function Thumb({ src, name, size = 44 }: { src?: string; name: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const style = { '--thumb-size': `${size}px` } as CSSProperties;
  if (src && !failed) {
    return (
      <img
        className="thumb"
        style={style}
        src={src}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        crossOrigin="anonymous"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <span className="thumb thumb-fallback" style={style} aria-hidden="true">
      {name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  );
}

/** "P 12 · G 5 · H 30" com a cor de cada macro num ponto ao lado (o texto fica na cor normal). */
export function MacroInline({ n }: { n: Pick<Nutrients, 'protein' | 'fat' | 'carbs'> }) {
  return (
    <span className="macro-inline">
      {MACROS.map((m) => (
        <span key={m.key} title={m.label}>
          <span className={`dot dot-${m.key}`} aria-hidden="true" />
          <span className="visually-hidden">{m.label} </span>
          <span aria-hidden="true">{m.short} </span>
          {fmtGrams(n[m.key])}
          <span className="visually-hidden"> g</span>
        </span>
      ))}
    </span>
  );
}

type DecimalInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'type'> & {
  value: string;
  onChange: (value: string) => void;
};

/** Campo numérico com teclado decimal do iPhone; aceita vírgula ou ponto. */
export function DecimalInput({ value, onChange, onFocus, ...rest }: DecimalInputProps) {
  return (
    <input
      {...rest}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      autoCorrect="off"
      spellCheck={false}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, ''))}
      onFocus={(e) => {
        onFocus?.(e);
        const el = e.currentTarget;
        requestAnimationFrame(() => el.setSelectionRange(0, el.value.length));
      }}
    />
  );
}

interface Option<T extends string> {
  value: T;
  label: ReactNode;
}

/** Grupo de opções exclusivas (rádios nativos com aspeto de botões). */
export function Choice<T extends string>({
  name,
  legend,
  value,
  options,
  onChange,
  className = '',
}: {
  name: string;
  legend: string;
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <fieldset className={`choice ${className}`}>
      <legend className="visually-hidden">{legend}</legend>
      {options.map((o) => (
        <label key={o.value}>
          <input
            className="visually-hidden"
            type="radio"
            name={name}
            value={o.value}
            checked={value === o.value}
            onChange={() => onChange(o.value)}
          />
          <span>{o.label}</span>
        </label>
      ))}
    </fieldset>
  );
}

export function MealChoice({ value, onChange }: { value: MealId; onChange: (m: MealId) => void }) {
  return (
    <Choice
      name="meal"
      legend="Refeição"
      className="choice-grid"
      value={value}
      options={MEALS.map((m) => ({ value: m.id, label: m.label }))}
      onChange={onChange}
    />
  );
}

export function FoodRow({ food, onOpen, onQuickAdd }: { food: Food; onOpen: () => void; onQuickAdd?: () => void }) {
  const meta = [displayBrand(food.name, food.brand), `${fmtKcal(food.per100.kcal)} kcal/100 ${food.unit}`].filter(Boolean).join(' · ');
  return (
    <li className="row">
      <button type="button" className="row-main" onClick={onOpen}>
        <Thumb src={food.imageUrl} name={food.name} />
        <span className="row-text">
          <span className="row-title">
            {food.name}
            {food.favorite === 1 && (
              <>
                <Icon name="star" size={14} filled className="row-star" />
                <span className="visually-hidden"> (favorito)</span>
              </>
            )}
          </span>
          <span className="row-meta">{meta}</span>
        </span>
      </button>
      {onQuickAdd && (
        <button
          type="button"
          className="icon-btn row-add"
          onClick={onQuickAdd}
          aria-label={`Adicionar ${fmtAmount(defaultAmount(food))} ${food.unit} de ${food.name}`}
        >
          <Icon name="plus" />
        </button>
      )}
    </li>
  );
}

export function EmptyState({ icon, title, children }: { icon: IconName; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <Icon name={icon} size={32} />
      <p className="empty-title">{title}</p>
      {children && <div className="empty-body">{children}</div>}
    </div>
  );
}
