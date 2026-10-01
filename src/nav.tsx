import { createContext, useContext, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { MealId } from './db';

/** Ecrãs que se abrem por cima dos separadores (como num navegador iOS). */
export type Page =
  | { name: 'add'; date: string; meal: MealId }
  | { name: 'scan'; date: string; meal: MealId }
  | { name: 'log'; foodId: number; date: string; meal: MealId; scanned?: 'off' | 'local' }
  | { name: 'entry'; entryId: number }
  | { name: 'food'; foodId?: number; barcode?: string; initialName?: string; then?: { date: string; meal: MealId } }
  | { name: 'quick'; date: string; meal: MealId; entryId?: number }
  | { name: 'goals' };

export interface StackItem {
  key: number;
  page: Page;
  scrollY: number;
}

export interface Nav {
  push(page: Page): void;
  /** Fecha o ecrã do topo. */
  pop(): void;
  /** Troca o ecrã do topo por outro. */
  replace(page: Page): void;
  /** Fecha um ecrã específico, esteja ou não no topo. */
  remove(key: number): void;
  reset(): void;
}

const NavContext = createContext<Nav | null>(null);
export const NavProvider = NavContext.Provider;

export function useNav(): Nav {
  const nav = useContext(NavContext);
  if (!nav) throw new Error('useNav() tem de estar dentro de <NavProvider>');
  return nav;
}

const PageKeyContext = createContext(0);
export const PageKeyProvider = PageKeyContext.Provider;
/** Identificador do ecrã atual na pilha (para se fechar a si próprio). */
export const usePageKey = () => useContext(PageKeyContext);

/** Pilha de ecrãs. Guarda a posição de scroll de cada ecrã para a repor ao voltar. */
export function useNavStack(): { stack: StackItem[]; nav: Nav } {
  const [stack, setStack] = useState<StackItem[]>([]);
  const stackRef = useRef(stack);
  const baseScroll = useRef(0);
  const nextKey = useRef(1);

  const nav = useMemo<Nav>(() => {
    const set = (next: StackItem[]) => {
      stackRef.current = next;
      setStack(next);
    };
    const item = (page: Page): StackItem => ({ key: nextKey.current++, page, scrollY: 0 });
    return {
      push(page) {
        const current = stackRef.current;
        const y = window.scrollY;
        if (current.length === 0) baseScroll.current = y;
        const saved = current.map((it, i) => (i === current.length - 1 ? { ...it, scrollY: y } : it));
        set([...saved, item(page)]);
      },
      pop() {
        set(stackRef.current.slice(0, -1));
      },
      replace(page) {
        set([...stackRef.current.slice(0, -1), item(page)]);
      },
      remove(key) {
        set(stackRef.current.filter((it) => it.key !== key));
      },
      reset() {
        set([]);
      },
    };
  }, []);

  const topKey = stack.at(-1)?.key ?? 0;
  useLayoutEffect(() => {
    const top = stackRef.current.at(-1);
    window.scrollTo(0, top ? top.scrollY : baseScroll.current);
  }, [topKey]);

  return { stack, nav };
}
