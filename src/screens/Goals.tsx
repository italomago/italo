import { useState } from 'react'
import { actions, useData } from '../store'
import { Empty, KV, Money, MoneyField, Progress, Section, Seg, TopBar, openForm, toast } from '../components/ui'
import { LineChart } from '../components/charts'
import { navigate } from '../router'
import { addMonthKey, endOfMonth, fmtDate, monthKey, monthLabel, today } from '../lib/dates'
import { fmtBRL, round2 } from '../lib/money'
import { monthsToGoal } from '../lib/finance'
import { averageMonthly, goalProgress, reserveValue } from '../lib/projections'
import type { GoalEntry } from '../lib/types'

const PRIO = { alta: { label: 'Alta', cls: 'neg' }, media: { label: 'Média', cls: 'warn' }, baixa: { label: 'Baixa', cls: 'info' } } as const

export function Goals() {
  const data = useData()
  const order = { alta: 0, media: 1, baixa: 2 }
  const goals = [...data.goals].sort((a, b) => order[a.priority] - order[b.priority])
  const reserve = reserveValue(data)
  return (
    <div className="screen">
      <TopBar
        title="Metas"
        sub="Futuras conquistas"
        right={
          <button className="icon-btn" onClick={() => openForm({ type: 'meta' })} aria-label="Nova meta">
            ＋
          </button>
        }
      />
      <div className="card" role="button" onClick={() => navigate('reserva')} style={{ cursor: 'pointer' }}>
        <div className="between">
          <div className="row">
            <span style={{ fontSize: 26 }}>🛟</span>
            <div>
              <div className="bold">Reserva financeira</div>
              <div className="tiny muted">{data.reserve.target ? `Meta ${fmtBRL(data.reserve.target)}` : 'Defina sua meta de reserva'}</div>
            </div>
          </div>
          <b>
            <Money value={reserve} />
          </b>
        </div>
        {data.reserve.target > 0 && (
          <div style={{ marginTop: 10 }}>
            <Progress pct={reserve / data.reserve.target} tone="pos" />
          </div>
        )}
      </div>

      <Section title="Minhas metas" />
      {goals.length ? (
        goals.map((g) => {
          const p = goalProgress(g)
          return (
            <div key={g.id} className="card" role="button" onClick={() => navigate('metas/' + g.id)} style={{ cursor: 'pointer' }}>
              <div className="between">
                <div className="row" style={{ minWidth: 0 }}>
                  <span style={{ fontSize: 26 }}>{g.icon}</span>
                  <div style={{ minWidth: 0 }}>
                    <div className="bold">{g.name}</div>
                    <div className="tiny muted">
                      <Money value={p.saved} /> de <Money value={g.target} />
                    </div>
                  </div>
                </div>
                <span className={`badge ${PRIO[g.priority].cls}`}>{PRIO[g.priority].label}</span>
              </div>
              <div style={{ margin: '10px 0 6px' }}>
                <Progress pct={p.pct} tone="pos" />
              </div>
              <div className="between tiny">
                <span className="bold">{Math.round(p.pct * 100)}%</span>
                <span className="muted">
                  {p.pct >= 1
                    ? '🏆 Meta atingida!'
                    : p.eta
                      ? `Previsão: ${monthLabel(p.eta, true)}`
                      : g.targetDate
                        ? `Até ${fmtDate(g.targetDate)}`
                        : 'Defina quanto guardar por mês'}
                </span>
              </div>
            </div>
          )
        })
      ) : (
        <div className="card">
          <Empty
            icon="🎯"
            title="Crie sua primeira meta"
            text="Comprar carro, viajar, quitar dívidas, montar reserva… O app mostra quando você chega lá."
            action="+ Nova meta"
            onAction={() => openForm({ type: 'meta' })}
          />
        </div>
      )}
    </div>
  )
}

function EntryForm({ onAdd, labelIn = 'Guardar', labelOut = 'Retirar' }: { onAdd: (e: Omit<GoalEntry, 'id'>) => void; labelIn?: string; labelOut?: string }) {
  const [dir, setDir] = useState<'in' | 'out'>('in')
  const [v, setV] = useState<number | undefined>()
  const [date, setDate] = useState(today())
  return (
    <div className="card">
      <Seg
        tone={dir}
        options={[
          { value: 'in', label: labelIn },
          { value: 'out', label: labelOut },
        ]}
        value={dir}
        onChange={setDir}
      />
      <div className="spacer" />
      <div className="two">
        <MoneyField label="Valor" value={v} onChange={setV} />
        <label className="field">
          <span>Data</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>
      <button
        className="btn"
        disabled={!v}
        onClick={() => {
          onAdd({ amount: dir === 'in' ? v! : -v!, date })
          setV(undefined)
          toast(dir === 'in' ? 'Valor guardado 💪' : 'Retirada registrada')
        }}
      >
        {dir === 'in' ? labelIn : labelOut}
      </button>
    </div>
  )
}

export function GoalDetail({ id }: { id: string }) {
  const data = useData()
  const g = data.goals.find((x) => x.id === id)
  const [sim, setSim] = useState<number | undefined>(g?.monthly)
  if (!g) return <div className="screen"><TopBar title="Meta não encontrada" showBack /></div>
  const p = goalProgress(g)
  const avg = averageMonthly(data)
  const simMonths = sim ? monthsToGoal(p.remaining, sim) : null
  return (
    <div className="screen">
      <TopBar
        title={`${g.icon} ${g.name}`}
        showBack
        right={
          <button className="icon-btn" onClick={() => openForm({ type: 'meta', id: g.id })} aria-label="Editar">
            ✏️
          </button>
        }
      />
      <div className="card">
        <div className="between small muted">
          <span>Acumulado</span>
          <span>Meta</span>
        </div>
        <div className="between">
          <b style={{ fontSize: 24 }}>
            <Money value={p.saved} />
          </b>
          <b>
            <Money value={g.target} />
          </b>
        </div>
        <div style={{ margin: '10px 0 6px' }}>
          <Progress pct={p.pct} tone="pos" />
        </div>
        <div className="between small">
          <span className="bold pos">{Math.round(p.pct * 100)}%</span>
          <span>
            Falta <b><Money value={p.remaining} /></b>
          </span>
        </div>
      </div>
      <div className="card">
        {g.targetDate && <KV k="Data desejada" v={fmtDate(g.targetDate)} />}
        {p.neededMonthly != null && <KV k="Para chegar na data, guarde por mês" v={fmtBRL(p.neededMonthly)} />}
        {g.monthly ? <KV k="Você planeja guardar por mês" v={fmtBRL(g.monthly)} /> : null}
        {p.eta && <KV k="Previsão de conquista" v={monthLabel(p.eta)} />}
        {g.note && <div className="small muted" style={{ marginTop: 8 }}>{g.note}</div>}
      </div>

      <Section title="Simular" />
      <div className="card">
        <MoneyField label="Se eu guardar por mês" value={sim} onChange={setSim} />
        {simMonths != null && Number.isFinite(simMonths) && p.remaining > 0 && (
          <div className="note pos" style={{ marginBottom: 0 }}>
            Guardando <b>{fmtBRL(sim!)}</b> por mês, você atinge a meta em <b>{simMonths} meses</b> — <b>{monthLabel(addMonthKey(monthKey(today()), simMonths))}</b>.
          </div>
        )}
        {avg.leftover > 0 && p.remaining > 0 && (
          <div className="small muted" style={{ marginTop: 8 }}>
            Hoje sobra em média {fmtBRL(avg.leftover)} por mês. Usando tudo, levaria {monthsToGoal(p.remaining, avg.leftover)} meses.
          </div>
        )}
      </div>

      <Section title="Movimentar" />
      <EntryForm onAdd={(e) => actions.addGoalEntry(g.id, e)} />

      {g.entries.length > 0 && (
        <>
          <Section title="Histórico" />
          <div className="card tight">
            {[...g.entries].reverse().map((e) => (
              <div key={e.id} className="list-item">
                <div className="ic">{e.amount >= 0 ? '⬇️' : '⬆️'}</div>
                <div className="main">
                  <div className="title">{e.amount >= 0 ? 'Aporte' : 'Retirada'}</div>
                  <div className="meta">{fmtDate(e.date)}</div>
                </div>
                <div className="end">
                  <Money value={e.amount} signed colored />
                  <div>
                    <button className="badge" style={{ border: 'none' }} onClick={() => confirm('Remover este registro?') && actions.removeGoalEntry(g.id, e.id)}>
                      remover
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export function Reserve() {
  const data = useData()
  const value = reserveValue(data)
  const avg = averageMonthly(data)
  const months = avg.expenses > 0 ? value / avg.expenses : 0
  const [target, setTarget] = useState<number | undefined>(data.reserve.target || undefined)
  const [targetMonths, setTargetMonths] = useState(data.reserve.targetMonths || 6)
  const suggested = round2(avg.expenses * targetMonths)
  // evolução mensal (últimos 12 meses)
  const cur = monthKey(today())
  const pts = Array.from({ length: 12 }, (_, i) => {
    const m = addMonthKey(cur, i - 11)
    const end = endOfMonth(m + '-01')
    return { label: monthLabel(m, true).split('/')[0], value: round2(data.reserve.entries.filter((e) => e.date <= end).reduce((a, e) => a + e.amount, 0)) }
  })
  const remaining = Math.max(0, data.reserve.target - value)
  return (
    <div className="screen">
      <TopBar title="Reserva financeira" showBack />
      <div className="card hero">
        <div className="label">Valor atual da reserva</div>
        <div className="big">
          <Money value={value} />
        </div>
        <div className="row">
          <div className="pill">
            <small>Cobre</small>
            <b>{avg.expenses > 0 ? `${months.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} meses` : '—'}</b>
          </div>
          <div className="pill">
            <small>Falta para a meta</small>
            <b>
              <Money value={remaining} />
            </b>
          </div>
        </div>
      </div>
      {data.reserve.target > 0 && (
        <div className="card">
          <div className="between small">
            <span>Meta: <b><Money value={data.reserve.target} /></b></span>
            <b>{Math.round((value / data.reserve.target) * 100)}%</b>
          </div>
          <div style={{ marginTop: 8 }}>
            <Progress pct={value / data.reserve.target} tone="pos" />
          </div>
        </div>
      )}
      <Section title="Movimentar reserva" />
      <EntryForm onAdd={(e) => actions.addReserveEntry(e)} labelIn="Depositar" labelOut="Usar reserva" />

      <Section title="Evolução mensal" />
      <div className="card">
        <LineChart points={pts} label="Reserva" />
      </div>

      <Section title="Meta da reserva" />
      <div className="card">
        <div className="small muted" style={{ marginBottom: 8 }}>
          Despesa média mensal: <b>{fmtBRL(avg.expenses)}</b>. Recomenda-se de 6 a 12 meses de despesas.
        </div>
        <label className="field">
          <span>Meses de despesas desejados</span>
          <div className="picker">
            {[3, 6, 9, 12].map((m) => (
              <button
                key={m}
                className={targetMonths === m ? 'on' : ''}
                onClick={() => {
                  setTargetMonths(m)
                  setTarget(round2(avg.expenses * m) || target)
                }}
              >
                {m} meses
              </button>
            ))}
          </div>
        </label>
        <MoneyField label="Meta da reserva" value={target} onChange={setTarget} hint={suggested ? `Sugestão para ${targetMonths} meses: ${fmtBRL(suggested)}` : undefined} />
        <button
          className="btn"
          onClick={() => {
            actions.setReserve(target ?? 0, targetMonths)
            toast('Meta da reserva salva')
          }}
        >
          Salvar meta
        </button>
      </div>

      {data.reserve.entries.length > 0 && (
        <>
          <Section title="Histórico" />
          <div className="card tight">
            {[...data.reserve.entries].reverse().map((e) => (
              <div key={e.id} className="list-item">
                <div className="ic">{e.amount >= 0 ? '⬇️' : '⬆️'}</div>
                <div className="main">
                  <div className="title">{e.amount >= 0 ? 'Depósito' : 'Uso da reserva'}</div>
                  <div className="meta">{fmtDate(e.date)}</div>
                </div>
                <div className="end">
                  <Money value={e.amount} signed colored />
                  <div>
                    <button className="badge" style={{ border: 'none' }} onClick={() => confirm('Remover este registro?') && actions.removeReserveEntry(e.id)}>
                      remover
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
