import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

/* ---------- Avisos rápidos (com "Anular") ---------- */

interface ToastOptions {
  message: string;
  action?: { label: string; run: () => void };
}

const ToastContext = createContext<(t: ToastOptions) => void>(() => {});
export const useToast = () => useContext(ToastContext);

/* ---------- Confirmação (diálogo nativo) ---------- */

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  destructive?: boolean;
}

const ConfirmContext = createContext<(o: ConfirmOptions) => Promise<boolean>>(async () => false);
export const useConfirm = () => useContext(ConfirmContext);

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<(ToastOptions & { id: number }) | null>(null);
  const toastTimer = useRef(0);
  const nextId = useRef(1);

  const showToast = useCallback((t: ToastOptions) => {
    clearTimeout(toastTimer.current);
    const id = nextId.current++;
    setToast({ ...t, id });
    toastTimer.current = window.setTimeout(() => setToast((cur) => (cur?.id === id ? null : cur)), t.action ? 5000 : 3000);
  }, []);

  const dialogRef = useRef<HTMLDialogElement>(null);
  const [confirmOpts, setConfirmOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback(
    (o: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        resolver.current?.(false);
        resolver.current = resolve;
        setConfirmOpts(o);
      }),
    [],
  );

  useEffect(() => {
    const dialog = dialogRef.current;
    if (confirmOpts && dialog && !dialog.open) dialog.showModal();
  }, [confirmOpts]);

  const settle = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    dialogRef.current?.close();
    setConfirmOpts(null);
  };

  return (
    <ToastContext.Provider value={showToast}>
      <ConfirmContext.Provider value={confirm}>
        {children}
        <div className="toast-region" role="status" aria-live="polite">
          {toast && (
            <div className="toast" key={toast.id}>
              <span>{toast.message}</span>
              {toast.action && (
                <button
                  type="button"
                  onClick={() => {
                    toast.action?.run();
                    setToast(null);
                  }}
                >
                  {toast.action.label}
                </button>
              )}
            </div>
          )}
        </div>
        <dialog
          ref={dialogRef}
          className="confirm"
          aria-labelledby="confirm-title"
          onCancel={(e) => {
            e.preventDefault();
            settle(false);
          }}
          onClick={(e) => {
            // Toque fora da caixa (no fundo escurecido) cancela.
            if (e.target === e.currentTarget) settle(false);
          }}
        >
          {confirmOpts && (
            <form
              method="dialog"
              onSubmit={(e) => {
                e.preventDefault();
                settle(true);
              }}
            >
              <h2 id="confirm-title">{confirmOpts.title}</h2>
              {confirmOpts.message && <p>{confirmOpts.message}</p>}
              <div className="confirm-actions">
                <button type="button" className="btn" onClick={() => settle(false)}>
                  Cancelar
                </button>
                <button type="submit" className={confirmOpts.destructive ? 'btn btn-danger' : 'btn btn-primary'}>
                  {confirmOpts.confirmLabel ?? 'Confirmar'}
                </button>
              </div>
            </form>
          )}
        </dialog>
      </ConfirmContext.Provider>
    </ToastContext.Provider>
  );
}
