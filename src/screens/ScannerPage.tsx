import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Icon } from '../components/Icon';
import { lookupBarcode } from '../data';
import type { MealId } from '../db';
import { isValidGtin, normalizeBarcode } from '../lib/barcode';
import { OffError } from '../lib/off';
import { useNav } from '../nav';

type Phase =
  | { kind: 'camera' }
  | { kind: 'manual' }
  | { kind: 'lookup'; code: string }
  | { kind: 'not-found'; code: string }
  | { kind: 'error'; code: string; message: string }
  | { kind: 'camera-error'; message: string };

const CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: {
    facingMode: { ideal: 'environment' },
    width: { ideal: 1920 },
    height: { ideal: 1080 },
  },
};

/** Leituras iguais necessárias para aceitar um código (evita leituras erradas). */
const CONFIRMATIONS = 2;
const SCAN_INTERVAL_MS = 60;

export function ScannerPage({ date, meal }: { date: string; meal: MealId }) {
  const nav = useNav();
  const [phase, setPhase] = useState<Phase>({ kind: 'camera' });
  const [cameraReady, setCameraReady] = useState(false);
  const [torch, setTorch] = useState<{ track: MediaStreamTrack; on: boolean } | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);

  // Câmara + descodificação contínua enquanto estamos na fase "camera".
  useEffect(() => {
    if (phase.kind !== 'camera') return;
    let cancelled = false;
    let stream: MediaStream | undefined;
    let timer = 0;
    const hits = new Map<string, number>();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const tick = async () => {
      if (cancelled) return;
      const video = videoRef.current;
      try {
        if (decodeImage && video && ctx && video.readyState >= video.HAVE_CURRENT_DATA && video.videoWidth > 0) {
          const crop = cropToFrame(video, frameRef.current);
          canvas.width = crop.dw;
          canvas.height = crop.dh;
          ctx.drawImage(video, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, crop.dw, crop.dh);
          const code = await decodeImage(ctx.getImageData(0, 0, crop.dw, crop.dh));
          if (cancelled) return;
          if (code) {
            const n = (hits.get(code) ?? 0) + 1;
            hits.set(code, n);
            if (n >= CONFIRMATIONS) {
              setPhase({ kind: 'lookup', code: normalizeBarcode(code) });
              return;
            }
          }
        }
      } catch (err) {
        console.warn('Falha a ler a imagem', err);
      }
      timer = window.setTimeout(tick, SCAN_INTERVAL_MS);
    };

    // O ZXing (JS + WebAssembly) só é carregado quando se abre o leitor.
    const scanner = import('../lib/scanner');
    let decodeImage: ((image: ImageData) => Promise<string | null>) | undefined;

    (async () => {
      const scannerReady = scanner.then(async (m) => {
        await m.loadScanner();
        decodeImage = m.decodeImage;
      });
      scannerReady.catch(() => {});
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new DOMException('', 'NotSupportedError');
        stream = await navigator.mediaDevices.getUserMedia(CONSTRAINTS);
        if (cancelled) return stopStream(stream);
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play().catch(() => {});
        await scannerReady;
        if (cancelled) return;
        setCameraReady(true);
        const track = stream.getVideoTracks()[0];
        const caps = track?.getCapabilities?.() as (MediaTrackCapabilities & { torch?: boolean }) | undefined;
        if (caps?.torch) setTorch({ track, on: false });
        void tick();
      } catch (err) {
        if (!cancelled) setPhase({ kind: 'camera-error', message: cameraErrorMessage(err) });
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(timer);
      stopStream(stream);
      setCameraReady(false);
      setTorch(null);
    };
  }, [phase.kind]);

  // Procura o código: primeiro nos alimentos guardados, depois no Open Food Facts.
  useEffect(() => {
    if (phase.kind !== 'lookup') return;
    const ctrl = new AbortController();
    const { code } = phase;
    lookupBarcode(code, ctrl.signal).then(
      (result) => {
        if (ctrl.signal.aborted) return;
        if (result.kind === 'found') {
          nav.replace({ name: 'log', foodId: result.food.id, date, meal, scanned: result.source });
        } else {
          setPhase({ kind: 'not-found', code: result.code });
        }
      },
      (err: unknown) => {
        if (!ctrl.signal.aborted) setPhase({ kind: 'error', code, message: lookupErrorMessage(err) });
      },
    );
    return () => ctrl.abort();
  }, [phase, nav, date, meal]);

  const toggleTorch = async () => {
    if (!torch) return;
    const on = !torch.on;
    try {
      await torch.track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] });
      setTorch({ ...torch, on });
    } catch {
      setTorch(null);
    }
  };

  const createFood = (code: string) => nav.replace({ name: 'food', barcode: code, then: { date, meal } });

  return (
    <div className="scanner">
      {phase.kind === 'camera' && (
        <>
          <video ref={videoRef} className="scanner-video" playsInline muted autoPlay aria-hidden="true" />
          <div className="scanner-overlay">
            <div ref={frameRef} className="scanner-frame">
              {cameraReady && <span className="scanner-laser" aria-hidden="true" />}
            </div>
            <p className="scanner-hint" role="status">
              {cameraReady ? 'Aponta para o código de barras' : 'A abrir a câmara…'}
            </p>
          </div>
          <div className="scanner-bottom">
            <button type="button" className="btn btn-on-dark" onClick={() => setPhase({ kind: 'manual' })}>
              <Icon name="keyboard" size={20} /> Escrever o código
            </button>
          </div>
        </>
      )}

      <div className="scanner-top">
        <button type="button" className="icon-btn icon-btn-on-dark" onClick={nav.pop} aria-label="Fechar leitor">
          <Icon name="close" />
        </button>
        {torch && (
          <button
            type="button"
            className="icon-btn icon-btn-on-dark"
            onClick={toggleTorch}
            aria-pressed={torch.on}
            aria-label="Lanterna"
          >
            <Icon name="flash" filled={torch.on} />
          </button>
        )}
      </div>

      {phase.kind === 'lookup' && (
        <div className="scanner-panel" role="status">
          <span className="spinner" aria-hidden="true" />
          <p>
            A procurar <strong className="mono">{phase.code}</strong>…
          </p>
        </div>
      )}

      {phase.kind === 'not-found' && (
        <div className="scanner-panel">
          <h2>Produto não encontrado</h2>
          <p>
            O código <strong className="mono">{phase.code}</strong> não está no Open Food Facts. Cria o alimento com os valores
            do rótulo: fica guardado e da próxima vez é reconhecido logo.
          </p>
          <button type="button" className="btn btn-primary" onClick={() => createFood(phase.code)}>
            Criar alimento
          </button>
          <button type="button" className="btn" onClick={() => setPhase({ kind: 'camera' })}>
            Ler outro código
          </button>
        </div>
      )}

      {phase.kind === 'error' && (
        <div className="scanner-panel">
          <h2>Não foi possível procurar</h2>
          <p>{phase.message}</p>
          <button type="button" className="btn btn-primary" onClick={() => setPhase({ kind: 'lookup', code: phase.code })}>
            Tentar novamente
          </button>
          <button type="button" className="btn" onClick={() => createFood(phase.code)}>
            Criar alimento à mão
          </button>
          <button type="button" className="btn-ghost" onClick={() => setPhase({ kind: 'camera' })}>
            Ler outro código
          </button>
        </div>
      )}

      {phase.kind === 'camera-error' && (
        <div className="scanner-panel">
          <h2>Câmara indisponível</h2>
          <p>{phase.message}</p>
          <button type="button" className="btn btn-primary" onClick={() => setPhase({ kind: 'manual' })}>
            Escrever o código
          </button>
          <button type="button" className="btn" onClick={() => setPhase({ kind: 'camera' })}>
            Tentar outra vez
          </button>
        </div>
      )}

      {phase.kind === 'manual' && (
        <ManualEntry onSubmit={(code) => setPhase({ kind: 'lookup', code })} onCamera={() => setPhase({ kind: 'camera' })} />
      )}
    </div>
  );
}

function ManualEntry({ onSubmit, onCamera }: { onSubmit: (code: string) => void; onCamera: () => void }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const code = value.replace(/\D/g, '');
    if (!isValidGtin(code)) {
      setError('Confirma os números: um código de barras tem 8 ou 13 dígitos (12 nos produtos americanos).');
      return;
    }
    onSubmit(normalizeBarcode(code));
  };

  return (
    <form className="scanner-panel" onSubmit={submit} noValidate>
      <h2>Escrever o código</h2>
      <div className="field">
        <label htmlFor="manual-code">Números por baixo das barras</label>
        <input
          id="manual-code"
          className="input mono"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          enterKeyHint="search"
          autoFocus
          value={value}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'manual-code-error' : undefined}
          onChange={(e) => {
            setValue(e.target.value.replace(/[^\d ]/g, ''));
            setError('');
          }}
        />
        {error && (
          <p id="manual-code-error" className="field-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <button type="submit" className="btn btn-primary">
        Procurar
      </button>
      <button type="button" className="btn" onClick={onCamera}>
        Usar a câmara
      </button>
    </form>
  );
}

function stopStream(stream: MediaStream | undefined) {
  stream?.getTracks().forEach((t) => t.stop());
}

/**
 * Recorta a zona do vídeo que corresponde à moldura no ecrã (com folga),
 * tendo em conta o `object-fit: cover`, e reduz a imagem para descodificar depressa.
 */
function cropToFrame(video: HTMLVideoElement, frame: HTMLElement | null) {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const box = video.getBoundingClientRect();
  const scale = Math.max(box.width / vw, box.height / vh) || 1;
  const offX = (vw * scale - box.width) / 2;
  const offY = (vh * scale - box.height) / 2;

  let fx = 0;
  let fy = 0;
  let fw = box.width;
  let fh = box.height;
  if (frame) {
    const r = frame.getBoundingClientRect();
    fx = r.left - box.left - r.width * 0.1;
    fy = r.top - box.top - r.height * 0.35;
    fw = r.width * 1.2;
    fh = r.height * 1.7;
  }

  const sx = Math.max(0, (fx + offX) / scale);
  const sy = Math.max(0, (fy + offY) / scale);
  const sw = Math.min(vw - sx, fw / scale);
  const sh = Math.min(vh - sy, fh / scale);
  const k = Math.min(1, 960 / Math.max(sw, sh));
  return { sx, sy, sw, sh, dw: Math.max(1, Math.round(sw * k)), dh: Math.max(1, Math.round(sh * k)) };
}

function cameraErrorMessage(err: unknown): string {
  const name = err instanceof DOMException ? err.name : '';
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Não foi dada autorização para usar a câmara. No iPhone: Definições › Apps › Safari › Câmara › Perguntar ou Permitir, e volta a abrir a app.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'Não foi encontrada nenhuma câmara neste aparelho.';
    case 'NotReadableError':
      return 'A câmara está ocupada por outra app. Fecha-a e tenta outra vez.';
    case 'NotSupportedError':
      return 'Este browser não deixa usar a câmara aqui. A app tem de ser aberta por HTTPS.';
    default:
      return 'Não foi possível iniciar o leitor de códigos de barras.';
  }
}

function lookupErrorMessage(err: unknown): string {
  if (err instanceof OffError) return err.message;
  if (!navigator.onLine || err instanceof TypeError) {
    return 'Sem ligação à internet. Os alimentos que já leste funcionam offline, mas este ainda não está guardado.';
  }
  return 'Ocorreu um erro inesperado ao procurar o produto.';
}
