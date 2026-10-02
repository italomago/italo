import { useMemo, useState } from 'react'
import { actions, useData } from '../store'
import { Empty, Money, Progress, Section, Stat, openForm } from '../components/ui'
import { GroupedBars, HBars, LineChart, StackedBars } from '../components/charts'
import { TxRow } from '../components/TxRow'
import { navigate } from '../router'
import { addDays, addMonthKey, endOfMonth, fmtDate, monthKey, monthLabel, today } from '../lib/dates'
import {
  balanceSeries,
  cardUsage,
  computeAlerts,
  currentBalance,
  forecast,
  goalProgress,
  incomeVsExpenses,
  makePeriod,
  periodStats,
  projectedBalance,
  type PeriodKind,
} from '../lib/projections'
import { summarizeFinancing } from '../lib/finance'

const PERIODS: { value: PeriodKind; label: string }[] = [
  { value: 'hoje', label: 'Hoje' },
  { value: 'semana', label: 'Esta semana' },
  { value: 'mes', label: 'Este mês' },
  { value: 'proximo', label: 'Próximo mês' },
  { value: 'personalizado', label: 'Personalizado' },
]

export function Dashboard() {
  const data = useData()
  const t0 = today()
  const [kind, setKind] = useState<PeriodKind>('mes')
  const [custom, setCustom] = useState({ start: t0.slice(0, 8) + '01', end: endOfMonth(t0) })
  const period = makePeriod(kind, t0, custom)

  const stats = useMemo(() => periodStats(data, period), [data, period.start, period.end])
  const balance = currentBalance(data)
  const endPrev = projectedBalance(data, endOfMonth(period.end))
  const alerts = useMemo(() => computeAlerts(data), [data])
  const upcoming = data.transactions
    .filter((t) => t.kind === 'out' && !t.paid && t.date <= addDays(t0, 7))
    .sort((a, b) => a.date.localeCompare(b.date))
  const overdueCount = upcoming.filter((t) => t.date < t0).length

  const cur = monthKey(t0)
  const ive = incomeVsExpenses(data, addMonthKey(cur, -4), 6)
  const series = balanceSeries(data, 4, 6)
  const fc = forecast(data, 12)
  const catName = (id: string) => {
    const c = data.categories.find((x) => x.id === id)
    return c ? `${c.icon} ${c.name}` : id
  }

  const isEmpty = data.transactions.length === 0

  return (
    <div className="screen">
      <div className="topbar">
        <h1>
          Minhas Finanças
          <div className="sub">{new Date(t0 + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
        </h1>
        <button className="icon-btn" aria-label="Ocultar valores" onClick={() => actions.updateSettings({ hideValues: !data.settings.hideValues })}>
          {data.settings.hideValues ? '🙈' : '👁️'}
        </button>
        <button className="icon-btn" aria-label="Alertas" onClick={() => navigate('alertas')}>
          🔔
          {alerts.filter((a) => a.level === 'danger' || a.level === 'warning').length > 0 && (
            <span className="dot">{alerts.filter((a) => a.level === 'danger' || a.level === 'warning').length}</span>
          )}
        </button>
      </div>

      <div className="chips" style={{ marginBottom: 8 }}>
        {PERIODS.map((p) => (
          <button key={p.value} className={`chip ${kind === p.value ? 'on' : ''}`} onClick={() => setKind(p.value)}>
            {p.label}
          </button>
        ))}
      </div>
      {kind === 'personalizado' && (
        <div className="two" style={{ marginBottom: 10 }}>
          <input className="input" type="date" value={custom.start} onChange={(e) => setCustom({ ...custom, start: e.target.value })} />
          <input className="input" type="date" value={custom.end} onChange={(e) => setCustom({ ...custom, end: e.target.value })} />
        </div>
      )}

      <div className="card hero">
        <div className="label">Saldo disponível atual</div>
        <div className="big">
          <Money value={balance} />
        </div>
        <div className="row">
          <div className="pill">
            <small>Previsão fim de {monthLabel(monthKey(period.end), true).split('/')[0]}</small>
            <b>
              <Money value={endPrev} />
            </b>
          </div>
          <div className="pill">
            <small>Resultado do período</small>
            <b>
              <Money value={stats.income - stats.expenses} signed />
            </b>
          </div>
        </div>
      </div>

      {isEmpty && (
        <div className="card" style={{ marginTop: 10 }}>
          <Empty
            icon="👋"
            title="Comece pelo básico"
            text="Informe o saldo da sua conta e cadastre seu salário. Depois, toque em “+ Lançamento” para registrar gastos."
            action="Ajustar saldo da conta"
            onAction={() => openForm({ type: 'conta', id: data.accounts[0]?.id })}
          />
        </div>
      )}

      <div className="spacer" />
      <div className="grid2">
        <Stat label="⬇️ Entradas" value={stats.income} tone="pos" hint={<>Recebido: <Money value={stats.incomeReceived} /></>} onClick={() => navigate('entradas')} />
        <Stat label="⬆️ Saídas" value={stats.expenses} tone="neg" onClick={() => navigate('saidas')} />
        <Stat label="📆 Parcelas / dívidas" value={stats.installments} onClick={() => navigate('compromissos')} />
        <Stat label="⏳ Falta pagar" value={stats.toPay} tone={stats.toPay > 0 ? 'warn' : undefined} onClick={() => navigate('compromissos')} />
        <Stat label="✅ Já pago" value={stats.paid} />
        <Stat
          label="🛟 Reserva"
          value={data.reserve.entries.reduce((a, e) => a + e.amount, 0)}
          hint={data.reserve.target ? `Meta: ${Math.round((data.reserve.entries.reduce((a, e) => a + e.amount, 0) / data.reserve.target) * 100)}%` : 'Toque para definir'}
          onClick={() => navigate('reserva')}
        />
      </div>

      <Section title={`Vencendo em 7 dias${overdueCount ? ` · ${overdueCount} atrasada(s)` : ''}`} action="Ver todas" onAction={() => navigate('compromissos')}>
        {upcoming.length ? (
          <div className="card tight">
            {upcoming.slice(0, 6).map((t) => (
              <TxRow key={t.id} t={t} />
            ))}
          </div>
        ) : (
          <div className="card small muted center">Nenhuma conta para os próximos 7 dias 🎉</div>
        )}
      </Section>

      {data.cards.length > 0 && (
        <Section title="Cartões" action="Ver faturas" onAction={() => navigate('cartoes')}>
          <div className="card tight">
            {data.cards.map((c) => {
              const u = cardUsage(data, c)
              return (
                <div key={c.id} className="list-item" role="button" onClick={() => navigate('cartoes/' + c.id)}>
                  <div className="ic">💳</div>
                  <div className="main">
                    <div className="title">{c.name}</div>
                    <div className="meta">
                      Fatura {monthLabel(u.openInvoice, true)}: <Money value={u.current?.total ?? 0} /> · vence dia {c.dueDay}
                    </div>
                    <div style={{ marginTop: 6 }}>
                      <Progress pct={u.pct} tone={u.pct > 0.9 ? 'neg' : u.pct > 0.7 ? 'warn' : undefined} />
                    </div>
                  </div>
                  <div className="end tiny muted">
                    Disponível
                    <div className="amount">
                      <Money value={u.available} />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </Section>
      )}

      {data.financings.length > 0 && (
        <Section title="Financiamentos ativos" action="Ver todos" onAction={() => navigate('financiamentos')}>
          <div className="card tight">
            {data.financings.map((f) => {
              const s = summarizeFinancing(f)
              if (s.remainingCount === 0) return null
              return (
                <div key={f.id} className="list-item" role="button" onClick={() => navigate('financiamentos/' + f.id)}>
                  <div className="ic">🏦</div>
                  <div className="main">
                    <div className="title">{f.name}</div>
                    <div className="meta">
                      {s.paidCount}/{s.resolved.n} pagas · próxima {fmtDate(s.nextInstallment?.date)}
                    </div>
                    <div style={{ marginTop: 6 }}>
                      <Progress pct={s.pctPaid} tone="pos" />
                    </div>
                  </div>
                  <div className="end">
                    <div className="amount">
                      <Money value={s.nextInstallment?.payment ?? 0} />
                    </div>
                    <div className="tiny muted">{Math.round(s.pctPaid * 100)}% pago</div>
                  </div>
                </div>
              )
            })}
          </div>
        </Section>
      )}

      {data.goals.length > 0 && (
        <Section title="Metas em andamento" action="Ver metas" onAction={() => navigate('metas')}>
          <div className="card tight">
            {data.goals.slice(0, 4).map((g) => {
              const p = goalProgress(g)
              return (
                <div key={g.id} className="list-item" role="button" onClick={() => navigate('metas/' + g.id)}>
                  <div className="ic">{g.icon}</div>
                  <div className="main">
                    <div className="title">{g.name}</div>
                    <div style={{ marginTop: 6 }}>
                      <Progress pct={p.pct} tone="pos" />
                    </div>
                  </div>
                  <div className="end tiny bold">{Math.round(p.pct * 100)}%</div>
                </div>
              )
            })}
          </div>
        </Section>
      )}

      <Section title="Entradas x saídas" />
      <div className="card">
        <GroupedBars
          data={ive.map((m) => ({ label: monthLabel(m.month, true).split('/')[0], values: { in: m.income, out: m.expenses } }))}
          series={[
            { key: 'in', label: 'Entradas', color: 'var(--s1)' },
            { key: 'out', label: 'Saídas', color: 'var(--s2)' },
          ]}
        />
      </div>

      <Section title="Gastos por categoria" />
      <div className="card">
        {stats.byCategory.length ? (
          <HBars items={stats.byCategory.slice(0, 7).map((c) => ({ key: c.id, label: catName(c.id), value: c.value }))} />
        ) : (
          <div className="small muted center">Sem gastos no período</div>
        )}
      </div>

      <Section title="Gastos por forma de pagamento" />
      <div className="card">
        {stats.byMethod.length ? (
          <HBars items={stats.byMethod.map((c) => ({ key: c.id, label: c.id, value: c.value }))} />
        ) : (
          <div className="small muted center">Sem gastos no período</div>
        )}
      </div>

      <Section title="Evolução do saldo" action="Próximos meses" onAction={() => navigate('planejamento')} />
      <div className="card">
        <LineChart points={series.map((p) => ({ label: monthLabel(p.month, true).split('/')[0], value: p.value, projected: p.projected }))} />
      </div>

      <Section title="Parcelas e dívidas nos próximos meses" />
      <div className="card">
        <StackedBars
          data={fc.map((m) => ({ label: monthLabel(m.month, true).split('/')[0], values: { p: m.purchases, d: m.debts, f: m.financings } }))}
          series={[
            { key: 'p', label: 'Compras parceladas', color: 'var(--s1)' },
            { key: 'd', label: 'Dívidas', color: 'var(--s2)' },
            { key: 'f', label: 'Financiamentos', color: 'var(--s3)' },
          ]}
        />
      </div>
    </div>
  )
}
