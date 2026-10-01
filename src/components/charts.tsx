import { useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { useElementWidth } from '../hooks';
import { addDays, diffDays, formatShortDate, formatWeekday } from '../lib/dates';
import { fmtGrams, fmtKcal, fmtNumber, type MACROS } from '../lib/nutrition';
import type { TrendPoint } from '../lib/trend';

/* ---------- Anel de calorias ---------- */

export function CalorieRing({ consumed, target, size = 104 }: { consumed: number; target: number; size?: number }) {
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const ratio = target > 0 ? consumed / target : 0;
  const over = consumed > target;
  const pct = Math.round(ratio * 100);
  return (
    <div className={over ? 'ring ring-over' : 'ring'} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle className="ring-track" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} />
        {ratio > 0 && (
          <circle
            className="ring-fill"
            cx={size / 2}
            cy={size / 2}
            r={r}
            strokeWidth={stroke}
            strokeDasharray={`${Math.min(ratio, 1) * c} ${c}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )}
      </svg>
      <span className="ring-label">
        <strong>{pct}%</strong>
        <span className="visually-hidden"> do objetivo de calorias</span>
      </span>
    </div>
  );
}

/* ---------- Medidor de macro ---------- */

export function MacroMeter({ macro, value, target }: { macro: (typeof MACROS)[number]; value: number; target: number }) {
  const ratio = target > 0 ? Math.min(value / target, 1) : 0;
  return (
    <div className="meter" data-macro={macro.key}>
      <span className="meter-label">
        <span className={`dot dot-${macro.key}`} aria-hidden="true" />
        {macro.label}
      </span>
      <span className="meter-value">
        <strong>{fmtGrams(value)}</strong> / {fmtGrams(target)} g
      </span>
      <span className="meter-bar" aria-hidden="true">
        <span style={{ inlineSize: `${ratio * 100}%` }} />
      </span>
    </div>
  );
}

/* ---------- Utilitários de escala ---------- */

function niceStep(range: number, count: number): number {
  const raw = range / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  return step * mag;
}

export function niceTicks(min: number, max: number, count = 4): number[] {
  let lo = min;
  let hi = max;
  if (hi - lo < 1e-9) {
    lo -= 1;
    hi += 1;
  }
  const step = niceStep(hi - lo, count);
  const start = Math.floor(lo / step) * step;
  const end = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= end + step / 2; v += step) ticks.push(Number(v.toFixed(6)));
  return ticks;
}

function Tooltip({ x, width, children }: { x: number; width: number; children: ReactNode }) {
  const half = 72;
  const left = Math.min(Math.max(x, half), Math.max(half, width - half));
  return (
    <div className="chart-tooltip" style={{ left }}>
      {children}
    </div>
  );
}

function useChartKeys(count: number, active: number | null, setActive: (i: number | null) => void) {
  return (e: KeyboardEvent) => {
    if (count === 0) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const dir = e.key === 'ArrowRight' ? 1 : -1;
      const next = active == null ? (dir > 0 ? 0 : count - 1) : Math.min(count - 1, Math.max(0, active + dir));
      setActive(next);
    } else if (e.key === 'Escape') {
      setActive(null);
    }
  };
}

const CHART_H = 196;
const PAD_TOP = 14;
const PAD_BOTTOM = 26;

/* ---------- Peso: pesagens (pontos) + tendência (linha) ---------- */

export function WeightChart({ points, start, end }: { points: TrendPoint[]; start: string; end: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const width = useElementWidth(ref);
  const [active, setActive] = useState<number | null>(null);
  const onKeyDown = useChartKeys(points.length, active, setActive);

  const left = 38;
  const right = 46;
  const plotW = Math.max(0, width - left - right);
  const plotH = CHART_H - PAD_TOP - PAD_BOTTOM;
  const days = Math.max(1, diffDays(start, end));
  const x = (date: string) => left + (diffDays(start, date) / days) * plotW;

  const values = points.flatMap((p) => [p.kg, p.trend]);
  const ticks = niceTicks(Math.min(...values), Math.max(...values), 4);
  const lo = ticks[0];
  const hi = ticks[ticks.length - 1];
  const y = (v: number) => PAD_TOP + (1 - (v - lo) / (hi - lo)) * plotH;

  const trendPath = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p.trend).toFixed(1)}`).join('');
  const last = points.at(-1);
  const dotR = days > 120 ? 3 : 4;
  const xLabels = [start, addDays(start, Math.round(days / 2)), end];

  const pick = (e: PointerEvent<SVGSVGElement>) => {
    const px = e.clientX - e.currentTarget.getBoundingClientRect().left;
    let best = 0;
    let bestDist = Infinity;
    points.forEach((p, i) => {
      const d = Math.abs(x(p.date) - px);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    setActive(best);
  };

  const current = active != null ? points[active] : null;
  const summary = last
    ? `Peso de tendência: ${fmtNumber(last.trend)} kg. ${points.length} pesagens entre ${formatShortDate(start)} e ${formatShortDate(end)}.`
    : 'Sem pesagens';

  return (
    <div className="chart" ref={ref}>
      {width > 0 && points.length > 0 && (
        <svg
          width={width}
          height={CHART_H}
          role="img"
          aria-label={summary}
          tabIndex={0}
          onPointerDown={pick}
          onPointerMove={pick}
          onPointerLeave={(e) => e.pointerType === 'mouse' && setActive(null)}
          onKeyDown={onKeyDown}
          onBlur={() => setActive(null)}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line className="chart-grid" x1={left} x2={width - right} y1={y(t)} y2={y(t)} />
              <text className="chart-tick" x={left - 8} y={y(t)} dy="0.32em" textAnchor="end">
                {fmtNumber(t)}
              </text>
            </g>
          ))}
          {xLabels.map((d, i) => (
            <text key={i} className="chart-tick" x={x(d)} y={CHART_H - 6} textAnchor={(['start', 'middle', 'end'] as const)[i]}>
              {formatShortDate(d)}
            </text>
          ))}
          {current && <line className="chart-crosshair" x1={x(current.date)} x2={x(current.date)} y1={PAD_TOP} y2={PAD_TOP + plotH} />}
          {points.map((p, i) => (
            <circle
              key={p.date}
              className={i === active ? 'weight-dot is-active' : 'weight-dot'}
              cx={x(p.date)}
              cy={y(p.kg)}
              r={i === active ? dotR + 1.5 : dotR}
            />
          ))}
          <path className="trend-line" d={trendPath} />
          {last && (
            <>
              <circle className="trend-end" cx={x(last.date)} cy={y(last.trend)} r={4} />
              <text className="chart-end-label" x={x(last.date) + 8} y={y(last.trend)} dy="0.32em">
                {fmtNumber(last.trend)}
              </text>
            </>
          )}
        </svg>
      )}
      {current && (
        <Tooltip x={x(current.date)} width={width}>
          <span className="tooltip-date">{formatShortDate(current.date)}</span>
          <span className="tooltip-row">
            <span className="key-dot" aria-hidden="true" />
            <strong>{fmtNumber(current.kg)} kg</strong> pesagem
          </span>
          <span className="tooltip-row">
            <span className="key-line" aria-hidden="true" />
            <strong>{fmtNumber(current.trend)} kg</strong> tendência
          </span>
        </Tooltip>
      )}
    </div>
  );
}

/* ---------- Calorias por dia (ou média semanal) vs objetivo ---------- */

export interface CalorieBar {
  /** Primeiro dia do período (dia ou semana). */
  date: string;
  kcal: number | null;
}

function barPath(x: number, y: number, w: number, h: number, radius: number): string {
  const r = Math.max(0, Math.min(radius, w / 2, h));
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

export function CaloriesChart({ bars, target, weekly }: { bars: CalorieBar[]; target: number; weekly: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const width = useElementWidth(ref);
  const [active, setActive] = useState<number | null>(null);
  const onKeyDown = useChartKeys(bars.length, active, setActive);

  const left = 44;
  const right = 10;
  const plotW = Math.max(0, width - left - right);
  const plotH = CHART_H - PAD_TOP - PAD_BOTTOM;
  const band = bars.length ? plotW / bars.length : 0;
  const barW = Math.max(1, Math.min(24, band - 2));

  const maxKcal = Math.max(target, ...bars.map((b) => b.kcal ?? 0));
  const ticks = niceTicks(0, maxKcal * 1.05, 4);
  const hi = ticks[ticks.length - 1];
  const y = (v: number) => PAD_TOP + (1 - v / hi) * plotH;
  const bandX = (i: number) => left + i * band;

  const labelIdx =
    bars.length <= 7 ? bars.map((_, i) => i) : [0, Math.floor((bars.length - 1) / 2), bars.length - 1];
  const label = (b: CalorieBar) => (bars.length <= 7 && !weekly ? formatWeekday(b.date) : formatShortDate(b.date));

  const current = active != null ? bars[active] : null;

  return (
    <div className="chart" ref={ref}>
      {width > 0 && (
        <svg
          width={width}
          height={CHART_H}
          role="img"
          aria-label={`Calorias ${weekly ? 'por semana (média diária)' : 'por dia'}, objetivo de ${fmtKcal(target)} kcal.`}
          tabIndex={0}
          onKeyDown={onKeyDown}
          onBlur={() => setActive(null)}
          onPointerLeave={(e) => e.pointerType === 'mouse' && setActive(null)}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line className="chart-grid" x1={left} x2={width - right} y1={y(t)} y2={y(t)} />
              <text className="chart-tick" x={left - 8} y={y(t)} dy="0.32em" textAnchor="end">
                {fmtKcal(t)}
              </text>
            </g>
          ))}
          {bars.map((b, i) =>
            b.kcal && b.kcal > 0 ? (
              <path
                key={b.date}
                className={i === active ? 'kcal-bar is-active' : 'kcal-bar'}
                d={barPath(bandX(i) + (band - barW) / 2, y(b.kcal), barW, y(0) - y(b.kcal), 4)}
              />
            ) : null,
          )}
          <line className="chart-target" x1={left} x2={width - right} y1={y(target)} y2={y(target)} />
          <text className="chart-target-label" x={width - right} y={y(target) - 6} textAnchor="end">
            Objetivo
          </text>
          {labelIdx.map((i) => (
            <text
              key={i}
              className="chart-tick"
              x={bars.length <= 7 ? bandX(i) + band / 2 : i === 0 ? bandX(i) : i === bars.length - 1 ? bandX(i) + band : bandX(i) + band / 2}
              y={CHART_H - 6}
              textAnchor={bars.length <= 7 ? 'middle' : i === 0 ? 'start' : i === bars.length - 1 ? 'end' : 'middle'}
            >
              {label(bars[i])}
            </text>
          ))}
          {/* Zonas de toque: a banda inteira de cada barra, não só a barra pintada. */}
          {bars.map((b, i) => (
            <rect
              key={`hit-${b.date}`}
              className="chart-hit"
              x={bandX(i)}
              y={PAD_TOP}
              width={band}
              height={plotH}
              onPointerDown={() => setActive(i)}
              onPointerEnter={() => setActive(i)}
            />
          ))}
        </svg>
      )}
      {current && (
        <Tooltip x={bandX(active!) + band / 2} width={width}>
          <span className="tooltip-date">{weekly ? `Semana de ${formatShortDate(current.date)}` : formatShortDate(current.date)}</span>
          <span className="tooltip-row">
            {current.kcal ? (
              <>
                <strong>{fmtKcal(current.kcal)} kcal</strong>
                {weekly ? ' média/dia' : ''}
              </>
            ) : (
              'Sem registos'
            )}
          </span>
        </Tooltip>
      )}
    </div>
  );
}
