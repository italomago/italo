import { useMemo, useState } from 'react'
import { useData } from '../store'
import { Empty, Money, Section, Stat, TopBar, openForm } from '../components/ui'
import { HBars } from '../components/charts'
import { TxGroups } from '../components/TxRow'
import { navigate } from '../router'
import { addMonthKey, endOfMonth, monthKey, monthLabel, today } from '../lib/dates'
import { sum } from '../lib/money'

/** Lista mensal de entradas ou saídas. */
export function TxList({ kind }: { kind: 'in' | 'out' }) {
  const data = useData()
  const [month, setMonth] = useState(monthKey(today()))
  const [status, setStatus] = useState<'todos' | 'pagos' | 'pendentes'>('todos')
  const start = month + '-01'
  const end = endOfMonth(start)
  const all = useMemo(
    () => data.transactions.filter((t) => t.kind === kind && t.date >= start && t.date <= end).sort((a, b) => b.date.localeCompare(a.date)),
    [data, kind, start, end],
  )
  const list = all.filter((t) => (status === 'todos' ? true : status === 'pagos' ? t.paid : !t.paid))
  const total = sum(all.map((t) => t.amount))
  const done = sum(all.filter((t) => t.paid).map((t) => t.amount))
  const isIn = kind === 'in'

  const groups = new Map<string, number>()
  for (const t of all) {
    const k = isIn ? (t.origin ?? data.categories.find((c) => c.id === t.categoryId)?.name ?? 'Outros') : (t.categoryId ?? 'outros-out')
    groups.set(k, (groups.get(k) ?? 0) + t.amount)
  }
  const label = (k: string) => {
    if (isIn) return k
    const c = data.categories.find((x) => x.id === k)
    return c ? `${c.icon} ${c.name}` : k
  }

  return (
    <div className="screen">
      <TopBar
        title={isIn ? 'Entradas' : 'Saídas'}
        right={
          <>
            <button className="icon-btn" onClick={() => navigate('pesquisa')} aria-label="Pesquisar">
              🔍
            </button>
            {!isIn && (
              <button className="icon-btn" onClick={() => navigate('compras')} aria-label="Compras">
                🛍️
              </button>
            )}
            <button className="icon-btn" onClick={() => navigate('recorrentes')} aria-label="Recorrentes">
              🔄
            </button>
          </>
        }
      />
      <div className="between" style={{ marginBottom: 10 }}>
        <button className="icon-btn" onClick={() => setMonth(addMonthKey(month, -1))} aria-label="Mês anterior">
          ‹
        </button>
        <div className="bold">
          {monthLabel(month)}
        </div>
        <button className="icon-btn" onClick={() => setMonth(addMonthKey(month, 1))} aria-label="Próximo mês">
          ›
        </button>
      </div>
      <div className="grid2">
        <Stat label={isIn ? 'Total previsto' : 'Total do mês'} value={total} tone={isIn ? 'pos' : 'neg'} />
        <Stat label={isIn ? 'Já recebido' : 'Já pago'} value={done} hint={<>Falta: <Money value={total - done} /></>} />
      </div>

      {groups.size > 0 && (
        <>
          <Section title={isIn ? 'Por origem' : 'Por categoria'} />
          <div className="card">
            <HBars items={[...groups.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => ({ key: k, label: label(k), value: v }))} />
          </div>
        </>
      )}

      <div className="spacer" />
      <div className="chips">
        {(['todos', 'pagos', 'pendentes'] as const).map((s) => (
          <button key={s} className={`chip ${status === s ? 'on' : ''}`} onClick={() => setStatus(s)}>
            {s === 'todos' ? 'Todos' : s === 'pagos' ? (isIn ? 'Recebidos' : 'Pagos') : isIn ? 'A receber' : 'A pagar'}
          </button>
        ))}
      </div>
      {list.length ? (
        <TxGroups txs={list} />
      ) : (
        <div className="card">
          <Empty
            icon={isIn ? '💰' : '🧾'}
            title={isIn ? 'Nenhuma entrada neste mês' : 'Nenhuma saída neste mês'}
            action={isIn ? '+ Nova entrada' : '+ Nova saída'}
            onAction={() => openForm({ type: isIn ? 'entrada' : 'saida' })}
          />
        </div>
      )}
    </div>
  )
}
