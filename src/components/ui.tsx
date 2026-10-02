import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { fmtBRL, fmtNum, parseMoney } from '../lib/money'
import { useData } from '../store'
import { back } from '../router'

// ---------------------------------------------------------------------------
// Pequenas stores globais: toast e formulário aberto
// ---------------------------------------------------------------------------

function createSignal<T>(initial: T) {
  let value = initial
  const subs = new Set<() => void>()
  return {
    get: () => value,
    set: (v: T) => {
      value = v
      subs.forEach((s) => s())
    },
    use: () =>
      useSyncExternalStore(
        (l) => {
          subs.add(l)
          return () => subs.delete(l)
        },
        () => value,
      ),
  }
}

const toastSignal = createSignal<string | null>(null)
let toastTimer: ReturnType<typeof setTimeout> | undefined
export function toast(msg: string) {
  toastSignal.set(msg)
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => toastSignal.set(null), 2600)
}
export function ToastHost() {
  const m = toastSignal.use()
  return m ? <div className="toast" role="status">{m}</div> : null
}

export type FormType =
  | 'entrada'
  | 'saida'
  | 'transferencia'
  | 'compra'
  | 'financiamento'
  | 'divida'
  | 'meta'
  | 'recorrente'
  | 'cartao'
  | 'conta'
  | 'lote'
  | 'importar'
  | 'tipo'
  | 'tx'
export interface FormSpec {
  type: FormType
  initial?: Record<string, unknown>
  id?: string
}
export const formSignal = createSignal<FormSpec | null>(null)
export const openForm = (spec: FormSpec) => formSignal.set(spec)
export const closeForm = () => formSignal.set(null)

// ---------------------------------------------------------------------------
// Componentes
// ---------------------------------------------------------------------------

export function Money({ value, signed, className = '', colored }: { value: number; signed?: boolean; className?: string; colored?: boolean }) {
  const hide = useData().settings.hideValues
  const tone = colored ? (value > 0.004 ? 'pos' : value < -0.004 ? 'neg' : '') : ''
  const txt = signed && value > 0.004 ? '+' + fmtBRL(value) : fmtBRL(value)
  return <span className={`num ${tone} ${className} ${hide ? 'blur' : ''}`}>{txt}</span>
}

export function TopBar({ title, sub, showBack, right }: { title: string; sub?: string; showBack?: boolean; right?: ReactNode }) {
  return (
    <div className="topbar">
      {showBack && (
        <button className="icon-btn" onClick={back} aria-label="Voltar">
          ←
        </button>
      )}
      <h1>
        {title}
        {sub && <div className="sub">{sub}</div>}
      </h1>
      {right}
    </div>
  )
}

export function Section({ title, action, onAction, children }: { title: string; action?: string; onAction?: () => void; children?: ReactNode }) {
  return (
    <>
      <div className="section-title">
        <span>{title}</span>
        {action && <button onClick={onAction}>{action}</button>}
      </div>
      {children}
    </>
  )
}

export function Sheet({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])
  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-label={title}>
        <div className="sheet-grip" />
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Fechar">
            ✕
          </button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </>
  )
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  )
}

const toInputStr = (v: number | undefined) => (v == null || Number.isNaN(v) ? '' : String(v).replace('.', ','))

/** Campo de valor em reais aceitando "1.200,50". */
export function MoneyField({
  label,
  value,
  onChange,
  big,
  hint,
  placeholder = '0,00',
  autoFocus,
}: {
  label: string
  value: number | undefined
  onChange: (v: number | undefined) => void
  big?: boolean
  hint?: ReactNode
  placeholder?: string
  autoFocus?: boolean
}) {
  const [text, setText] = useState(toInputStr(value))
  useEffect(() => {
    const parsed = parseMoney(text)
    if (parsed !== (value ?? null)) setText(toInputStr(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  const input = (
    <input
      className={big ? 'money-input num' : 'num'}
      inputMode="decimal"
      placeholder={big ? 'R$ 0,00' : placeholder}
      value={text}
      autoFocus={autoFocus}
      onBlur={() => {
        const v = parseMoney(text)
        if (v != null) setText(fmtNum(v))
      }}
      onChange={(e) => {
        const t = e.target.value.replace(/[^\d.,]/g, '')
        setText(t)
        onChange(parseMoney(t) ?? undefined)
      }}
    />
  )
  if (big)
    return (
      <div className="money-wrap">
        <small>{label}</small>
        {input}
        {hint && <small>{hint}</small>}
      </div>
    )
  return (
    <Field label={label} hint={hint}>
      {input}
    </Field>
  )
}

/** Campo numérico simples (inteiros ou percentuais). */
export function NumberField({
  label,
  value,
  onChange,
  hint,
  suffix,
  decimals,
  placeholder,
}: {
  label: string
  value: number | undefined
  onChange: (v: number | undefined) => void
  hint?: ReactNode
  suffix?: string
  decimals?: boolean
  placeholder?: string
}) {
  const [text, setText] = useState(toInputStr(value))
  useEffect(() => {
    const p = text === '' ? undefined : Number(text.replace(',', '.'))
    if (p !== value) setText(toInputStr(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  return (
    <Field label={label + (suffix ? ` (${suffix})` : '')} hint={hint}>
      <input
        className="num"
        inputMode={decimals ? 'decimal' : 'numeric'}
        value={text}
        placeholder={placeholder}
        onChange={(e) => {
          const t = e.target.value.replace(decimals ? /[^\d.,]/g : /\D/g, '')
          setText(t)
          const n = t === '' ? undefined : Number(t.replace(',', '.'))
          onChange(n != null && Number.isFinite(n) ? n : undefined)
        }}
      />
    </Field>
  )
}

export function Toggle({ label, sub, value, onChange }: { label: string; sub?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" className={`toggle ${value ? 'on' : ''}`} onClick={() => onChange(!value)} role="switch" aria-checked={value}>
      <div>
        <div className="bold" style={{ fontSize: 15 }}>
          {label}
        </div>
        {sub && <div className="tiny muted">{sub}</div>}
      </div>
      <div className="sw" />
    </button>
  )
}

export function Picker<T extends string>({
  options,
  value,
  onChange,
  onAdd,
}: {
  options: { value: T; label: string }[]
  value: T | undefined
  onChange: (v: T) => void
  onAdd?: () => void
}) {
  return (
    <div className="picker">
      {options.map((o) => (
        <button type="button" key={o.value} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
      {onAdd && (
        <button type="button" onClick={onAdd}>
          + Nova
        </button>
      )}
    </div>
  )
}

export function Seg<T extends string>({
  options,
  value,
  onChange,
  tone,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
  tone?: 'in' | 'out'
}) {
  return (
    <div className={`seg ${tone ?? ''}`}>
      {options.map((o) => (
        <button type="button" key={o.value} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Progress({ pct, tone }: { pct: number; tone?: 'pos' | 'warn' | 'neg' }) {
  return (
    <div className={`progress ${tone ?? ''}`} role="progressbar" aria-valuenow={Math.round(pct * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div style={{ width: `${Math.max(0, Math.min(1, pct)) * 100}%` }} />
    </div>
  )
}

export function Empty({ icon, title, text, action, onAction }: { icon: string; title: string; text?: string; action?: string; onAction?: () => void }) {
  return (
    <div className="empty">
      <div className="e-ic">{icon}</div>
      <div className="bold" style={{ color: 'var(--text)' }}>
        {title}
      </div>
      {text && <p>{text}</p>}
      {action && (
        <button className="btn sm" onClick={onAction}>
          {action}
        </button>
      )}
    </div>
  )
}

export function KV({ k, v, total }: { k: ReactNode; v: ReactNode; total?: boolean }) {
  return (
    <div className={`kv ${total ? 'total' : ''}`}>
      <span>{k}</span>
      <span className="num">{v}</span>
    </div>
  )
}

export function Stat({ label, value, hint, tone, onClick }: { label: ReactNode; value: number; hint?: ReactNode; tone?: 'pos' | 'neg' | 'warn'; onClick?: () => void }) {
  return (
    <div className="card stat" onClick={onClick} style={onClick ? { cursor: 'pointer' } : undefined}>
      <div className="label">{label}</div>
      <div className={`value ${tone ?? ''}`}>
        <Money value={value} />
      </div>
      {hint && <div className="hint">{hint}</div>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Diálogos próprios (substituem prompt/confirm nativos)
// ---------------------------------------------------------------------------

interface DialogReq {
  kind: 'confirm' | 'prompt'
  message: string
  value?: string
  secret?: boolean
  numeric?: boolean
  danger?: boolean
  okLabel?: string
  resolve: (v: string | boolean | null) => void
}
const dialogSignal = createSignal<DialogReq | null>(null)

export function askConfirm(message: string, opts: { danger?: boolean; okLabel?: string } = {}): Promise<boolean> {
  return new Promise((resolve) => dialogSignal.set({ kind: 'confirm', message, ...opts, resolve: (v) => resolve(v === true) }))
}
export function askText(message: string, value = '', opts: { secret?: boolean; numeric?: boolean } = {}): Promise<string | null> {
  return new Promise((resolve) =>
    dialogSignal.set({ kind: 'prompt', message, value, ...opts, resolve: (v) => resolve(typeof v === 'string' ? v : null) }),
  )
}

export function DialogHost() {
  const d = dialogSignal.use()
  const [text, setText] = useState('')
  useEffect(() => setText(d?.value ?? ''), [d])
  if (!d) return null
  const close = (v: string | boolean | null) => {
    dialogSignal.set(null)
    d.resolve(v)
  }
  return (
    <>
      <div className="sheet-backdrop" style={{ zIndex: 90 }} onClick={() => close(null)} />
      <form
        className="dialog"
        role="dialog"
        aria-label={d.message}
        onSubmit={(e) => {
          e.preventDefault()
          close(d.kind === 'confirm' ? true : text)
        }}
      >
        <div className="bold" style={{ fontSize: 16 }}>
          {d.message}
        </div>
        {d.kind === 'prompt' && (
          <input
            id="dialog-input"
            className="input"
            autoFocus
            value={text}
            type={d.secret ? 'password' : 'text'}
            inputMode={d.numeric ? 'numeric' : undefined}
            onChange={(e) => setText(e.target.value)}
          />
        )}
        <div className="btn-row">
          <button type="button" className="btn secondary" onClick={() => close(d.kind === 'confirm' ? false : null)}>
            Cancelar
          </button>
          <button type="submit" className={`btn ${d.danger ? 'danger' : ''}`}>
            {d.okLabel ?? (d.kind === 'confirm' ? 'Confirmar' : 'OK')}
          </button>
        </div>
      </form>
    </>
  )
}
