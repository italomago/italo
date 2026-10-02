// Gráficos simples em SVG, leves e responsivos. Toque em uma coluna para ver os valores.
import { useState, type ReactNode } from 'react'
import { fmtBRL, fmtCompact } from '../lib/money'
import { useData } from '../store'

const W = 340
const H = 170
const PAD = { l: 40, r: 6, t: 10, b: 22 }

function niceMax(v: number): number {
  if (v <= 0) return 1
  const p = Math.pow(10, Math.floor(Math.log10(v)))
  const n = v / p
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10
  return nice * p
}

function scale(min: number, max: number) {
  const top = niceMax(Math.max(max, 0))
  const bottom = min < 0 ? -niceMax(-min) : 0
  const ih = H - PAD.t - PAD.b
  const y = (v: number) => PAD.t + ((top - v) / (top - bottom || 1)) * ih
  const ticks = bottom < 0 ? [bottom, 0, top] : [0, top / 2, top]
  return { y, ticks }
}

export interface Series {
  key: string
  label: string
  color: string
}

function Legend({ series, extra }: { series: Series[]; extra?: ReactNode }) {
  return (
    <div className="legend">
      {series.map((s) => (
        <span key={s.key}>
          <i style={{ background: s.color }} />
          {s.label}
        </span>
      ))}
      {extra}
    </div>
  )
}

function Tip({ children }: { children: ReactNode }) {
  const hide = useData().settings.hideValues
  return <div className={`tip num ${hide ? 'blur' : ''}`}>{children}</div>
}

/** Barras agrupadas (ex.: entradas x saídas por mês). */
export function GroupedBars({ data, series, height = H }: { data: { label: string; values: Record<string, number> }[]; series: Series[]; height?: number }) {
  const [sel, setSel] = useState<number | null>(null)
  const all = data.flatMap((d) => series.map((s) => d.values[s.key] ?? 0))
  const { y, ticks } = scale(Math.min(0, ...all), Math.max(0, ...all))
  const iw = W - PAD.l - PAD.r
  const step = iw / Math.max(1, data.length)
  const gap = 2
  const bw = Math.min(16, (step * 0.7 - gap * (series.length - 1)) / series.length)
  const cur = sel ?? data.length - 1
  return (
    <div>
      <Legend series={series} />
      <svg className="chart" viewBox={`0 0 ${W} ${height}`} role="img" aria-label={series.map((s) => s.label).join(' x ')}>
        {ticks.map((t) => (
          <g key={t}>
            <line className="grid" x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} />
            <text x={PAD.l - 6} y={y(t) + 3} textAnchor="end">
              {fmtCompact(t)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const x0 = PAD.l + i * step + (step - (bw * series.length + gap * (series.length - 1))) / 2
          return (
            <g key={d.label} onClick={() => setSel(i)} style={{ cursor: 'pointer' }}>
              <rect x={PAD.l + i * step} y={PAD.t} width={step} height={H - PAD.t - PAD.b} fill={i === cur ? 'var(--surface-2)' : 'transparent'} rx={6} />
              {series.map((s, j) => {
                const v = d.values[s.key] ?? 0
                const top = y(Math.max(v, 0))
                const h = Math.max(v === 0 ? 0 : 1.5, Math.abs(y(v) - y(0)))
                return <rect key={s.key} x={x0 + j * (bw + gap)} y={v >= 0 ? top : y(0)} width={bw} height={h} rx={Math.min(4, bw / 2)} fill={s.color} />
              })}
              <text x={PAD.l + i * step + step / 2} y={H - 6} textAnchor="middle">
                {d.label}
              </text>
            </g>
          )
        })}
      </svg>
      {data[cur] && (
        <Tip>
          <b>{data[cur].label}</b>
          {series.map((s) => (
            <span key={s.key}>
              {' · '}
              {s.label}: {fmtBRL(data[cur].values[s.key] ?? 0)}
            </span>
          ))}
        </Tip>
      )}
    </div>
  )
}

/** Barras empilhadas (ex.: parcelas por tipo ao longo dos meses). */
export function StackedBars({ data, series, initial = 0 }: { data: { label: string; values: Record<string, number> }[]; series: Series[]; initial?: number }) {
  const [sel, setSel] = useState<number | null>(null)
  const totals = data.map((d) => series.reduce((a, s) => a + (d.values[s.key] ?? 0), 0))
  const { y, ticks } = scale(0, Math.max(0, ...totals))
  const iw = W - PAD.l - PAD.r
  const step = iw / Math.max(1, data.length)
  const bw = Math.min(20, step * 0.62)
  const cur = sel ?? initial
  return (
    <div>
      <Legend series={series} />
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Parcelas por mês">
        {ticks.map((t) => (
          <g key={t}>
            <line className="grid" x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} />
            <text x={PAD.l - 6} y={y(t) + 3} textAnchor="end">
              {fmtCompact(t)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          let acc = 0
          const x = PAD.l + i * step + (step - bw) / 2
          return (
            <g key={d.label} onClick={() => setSel(i)} style={{ cursor: 'pointer' }}>
              <rect x={PAD.l + i * step} y={PAD.t} width={step} height={H - PAD.t - PAD.b} fill={i === cur ? 'var(--surface-2)' : 'transparent'} rx={6} />
              {series.map((s) => {
                const v = d.values[s.key] ?? 0
                if (v <= 0) return null
                const y1 = y(acc + v)
                const y0 = y(acc)
                acc += v
                // 2px de respiro entre segmentos
                return <rect key={s.key} x={x} y={y1} width={bw} height={Math.max(1, y0 - y1 - 2)} rx={3} fill={s.color} />
              })}
              <text x={PAD.l + i * step + step / 2} y={H - 6} textAnchor="middle">
                {d.label}
              </text>
            </g>
          )
        })}
      </svg>
      {data[cur] && (
        <Tip>
          <b>{data[cur].label}</b>: {fmtBRL(totals[cur])}
          {series
            .filter((s) => (data[cur].values[s.key] ?? 0) > 0)
            .map((s) => (
              <span key={s.key}>
                {' · '}
                {s.label} {fmtBRL(data[cur].values[s.key])}
              </span>
            ))}
        </Tip>
      )}
    </div>
  )
}

/** Linha (ex.: evolução do saldo). Pontos projetados aparecem tracejados. */
export function LineChart({
  points,
  color = 'var(--s1)',
  label = 'Saldo',
  projectedLabel = 'Projeção',
}: {
  points: { label: string; value: number; projected?: boolean }[]
  color?: string
  label?: string
  projectedLabel?: string
}) {
  const [sel, setSel] = useState<number | null>(null)
  if (!points.length) return null
  const vals = points.map((p) => p.value)
  const { y, ticks } = scale(Math.min(0, ...vals), Math.max(0, ...vals))
  const iw = W - PAD.l - PAD.r
  const step = iw / Math.max(1, points.length)
  const x = (i: number) => PAD.l + step * i + step / 2
  const firstProj = points.findIndex((p) => p.projected)
  const solid = points.map((p, i) => ({ ...p, i })).filter((p) => !p.projected || p.i === firstProj)
  const dashed = firstProj >= 0 ? points.map((p, i) => ({ ...p, i })).slice(Math.max(0, firstProj - 1)) : []
  const path = (ps: { value: number; i: number }[]) => ps.map((p, k) => `${k ? 'L' : 'M'}${x(p.i)},${y(p.value)}`).join(' ')
  const cur = sel ?? (firstProj >= 0 ? firstProj : points.length - 1)
  const hasProj = firstProj >= 0
  return (
    <div>
      <div className="legend">
        <span>
          <i style={{ background: color }} />
          {label}
        </span>
        {hasProj && (
          <span>
            <i className="dash" />
            {projectedLabel}
          </span>
        )}
      </div>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        {ticks.map((t) => (
          <g key={t}>
            <line className="grid" x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} style={t === 0 ? { stroke: 'var(--muted)', strokeOpacity: 0.5 } : undefined} />
            <text x={PAD.l - 6} y={y(t) + 3} textAnchor="end">
              {fmtCompact(t)}
            </text>
          </g>
        ))}
        {solid.length > 1 && <path d={path(solid)} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
        {dashed.length > 1 && <path d={path(dashed)} fill="none" stroke={color} strokeWidth={2} strokeDasharray="5 4" strokeLinejoin="round" />}
        {points.map((p, i) => (
          <g key={i} onClick={() => setSel(i)} style={{ cursor: 'pointer' }}>
            <rect x={x(i) - step / 2} y={PAD.t} width={step} height={H - PAD.t - PAD.b} fill="transparent" />
            {i === cur && <line x1={x(i)} x2={x(i)} y1={PAD.t} y2={H - PAD.b} stroke="var(--muted)" strokeOpacity={0.4} />}
            <circle
              cx={x(i)}
              cy={y(p.value)}
              r={i === cur ? 5 : 3.5}
              fill={p.value < 0 ? 'var(--neg)' : color}
              stroke="var(--surface)"
              strokeWidth={2}
            />
            <text x={x(i)} y={H - 6} textAnchor="middle">
              {p.label}
            </text>
          </g>
        ))}
      </svg>
      <Tip>
        <b>{points[cur].label}</b>
        {points[cur].projected ? ' (previsto)' : ''}: {fmtBRL(points[cur].value)}
      </Tip>
    </div>
  )
}

/** Lista com barras horizontais (ex.: gastos por categoria). */
export function HBars({ items, max }: { items: { key: string; label: ReactNode; value: number; sub?: ReactNode }[]; max?: number }) {
  const hide = useData().settings.hideValues
  const total = items.reduce((a, b) => a + b.value, 0)
  const m = max ?? Math.max(1, ...items.map((i) => i.value))
  return (
    <div>
      {items.map((i) => (
        <div className="hbar" key={i.key}>
          <div className="between">
            <span>{i.label}</span>
            <span className={`num ${hide ? 'blur' : ''}`}>
              <b>{fmtBRL(i.value)}</b> <span className="muted tiny">{total > 0 ? Math.round((i.value / total) * 100) : 0}%</span>
            </span>
          </div>
          <div className="track">
            <div style={{ width: `${(i.value / m) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}
