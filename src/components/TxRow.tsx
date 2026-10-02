import { actions, useData } from '../store'
import { fmtDateShort, today } from '../lib/dates'
import type { Transaction } from '../lib/types'
import { Money, openForm, toast } from './ui'

export function TxRow({ t, showDate = true }: { t: Transaction; showDate?: boolean }) {
  const data = useData()
  const cat = data.categories.find((c) => c.id === t.categoryId)
  const card = t.cardId ? data.cards.find((c) => c.id === t.cardId) : undefined
  const late = !t.paid && t.date < today()
  const icon = t.kind === 'transfer' ? '🔁' : (cat?.icon ?? (t.kind === 'in' ? '💰' : '📦'))
  const meta = [
    showDate ? fmtDateShort(t.date) : null,
    t.installment ? `${t.installment.n}/${t.installment.total}` : null,
    t.kind === 'in' ? t.origin : cat?.name,
    card ? `💳 ${card.name}` : t.method,
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <div className="list-item" role="button" onClick={() => openForm({ type: 'tx', id: t.id })}>
      <div className="ic" style={{ background: cat ? `color-mix(in srgb, ${cat.color} 16%, transparent)` : undefined }}>
        {icon}
      </div>
      <div className="main">
        <div className="title">{t.description}</div>
        <div className="meta">{meta}</div>
      </div>
      <div className="end">
        <div className="amount">
          <Money value={t.kind === 'out' ? -t.amount : t.amount} className={t.kind === 'in' ? 'pos' : t.kind === 'out' ? '' : 'muted'} signed={t.kind === 'in'} />
        </div>
        {t.kind !== 'transfer' && (
          <button
            className={`badge ${t.paid ? 'pos' : late ? 'neg' : 'warn'}`}
            style={{ border: 'none', marginTop: 3 }}
            onClick={(e) => {
              e.stopPropagation()
              actions.setPaid(t.id, !t.paid)
              toast(t.paid ? 'Marcado como pendente' : t.kind === 'in' ? 'Marcado como recebido' : 'Marcado como pago')
            }}
          >
            {t.paid ? (t.kind === 'in' ? '✓ recebido' : '✓ pago') : late ? 'atrasado' : t.kind === 'in' ? 'a receber' : 'a pagar'}
          </button>
        )}
      </div>
    </div>
  )
}

/** Agrupa lançamentos por dia com cabeçalho. */
export function TxGroups({ txs }: { txs: Transaction[] }) {
  const groups = new Map<string, Transaction[]>()
  for (const t of txs) {
    if (!groups.has(t.date)) groups.set(t.date, [])
    groups.get(t.date)!.push(t)
  }
  const fmt = (d: string) => {
    const s = new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
    return s.charAt(0).toUpperCase() + s.slice(1)
  }
  return (
    <>
      {[...groups.entries()].map(([d, list]) => (
        <div key={d}>
          <div className="day-head">{d === today() ? 'Hoje' : fmt(d)}</div>
          <div className="card tight">
            {list.map((t) => (
              <TxRow key={t.id} t={t} showDate={false} />
            ))}
          </div>
        </div>
      ))}
    </>
  )
}
