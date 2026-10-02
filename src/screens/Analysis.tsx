// Próximos meses, Minha situação financeira, Alertas, Pesquisa e Relatórios.
import { useMemo, useState } from 'react'
import { useData } from '../store'
import { Empty, KV, Money, Section, Seg, Stat, TopBar, toast } from '../components/ui'
import { GroupedBars, HBars, LineChart, StackedBars } from '../components/charts'
import { TxGroups } from '../components/TxRow'
import { navigate } from '../router'
import { addMonthKey, monthKey, monthLabel, today } from '../lib/dates'
import { fmtBRL, fmtPct, round2, sum } from '../lib/money'
import { monthsToGoal, summarizeFinancing } from '../lib/finance'
import {
  averageMonthly,
  computeAlerts,
  currentBalance,
  forecast,
  goalProgress,
  isInstallment,
  periodStats,
  reserveValue,
  balanceAt,
} from '../lib/projections'
import { downloadFile, shareFile, transactionsCSV, toCSV } from '../lib/export'
import type { Transaction } from '../lib/types'

// ---------------------------------------------------------------------------
// Próximos meses
// ---------------------------------------------------------------------------

export function Planning() {
  const data = useData()
  const fc = useMemo(() => forecast(data, 12), [data])
  const [view, setView] = useState<'lista' | 'grafico'>('lista')
  return (
    <div className="screen">
      <TopBar title="Próximos meses" sub="Previsão dos próximos 12 meses" showBack />
      <Seg
        options={[
          { value: 'lista', label: 'Mês a mês' },
          { value: 'grafico', label: 'Gráficos' },
        ]}
        value={view}
        onChange={setView}
      />
      <div className="spacer" />
      {view === 'grafico' ? (
        <>
          <div className="card">
            <h3>Saldo projetado</h3>
            <LineChart points={fc.map((m) => ({ label: monthLabel(m.month, true).split('/')[0], value: m.balance, projected: true }))} label="Saldo previsto" projectedLabel="Previsão" />
          </div>
          <div className="card">
            <h3>Entradas x saídas previstas</h3>
            <GroupedBars
              data={fc.map((m) => ({ label: monthLabel(m.month, true).split('/')[0], values: { in: m.income, out: m.totalOut } }))}
              series={[
                { key: 'in', label: 'Entradas', color: 'var(--s1)' },
                { key: 'out', label: 'Saídas', color: 'var(--s2)' },
              ]}
            />
          </div>
          <div className="card">
            <h3>Parcelas comprometidas</h3>
            <StackedBars
              data={fc.map((m) => ({ label: monthLabel(m.month, true).split('/')[0], values: { p: m.purchases, d: m.debts, f: m.financings } }))}
              series={[
                { key: 'p', label: 'Compras parceladas', color: 'var(--s1)' },
                { key: 'd', label: 'Dívidas', color: 'var(--s2)' },
                { key: 'f', label: 'Financiamentos', color: 'var(--s3)' },
              ]}
            />
          </div>
        </>
      ) : (
        fc.map((m) => (
          <div key={m.month} className="card month-card">
            <h4>
              <span>{monthLabel(m.month)}</span>
              {m.balance < 0 && <span className="badge neg">saldo negativo</span>}
            </h4>
            <KV k="Entradas" v={<span className="pos">{fmtBRL(m.income)}</span>} />
            <KV k="Despesas" v={fmtBRL(m.expenses)} />
            {m.purchases > 0 && <KV k="Compras parceladas" v={fmtBRL(m.purchases)} />}
            {m.debts > 0 && <KV k="Dívidas" v={fmtBRL(m.debts)} />}
            {m.financings > 0 && <KV k="Financiamentos" v={fmtBRL(m.financings)} />}
            <KV k="Total de saídas" v={<span className="neg">{fmtBRL(m.totalOut)}</span>} />
            <KV k="Resultado do mês" v={<Money value={m.income - m.totalOut} signed colored />} />
            <KV k="Saldo previsto" v={<Money value={m.balance} colored />} total />
            {m.income > 0 && m.installmentsTotal > 0 && <div className="tiny muted">Parcelas comprometem {fmtPct(m.commitment, 0)} das entradas</div>}
          </div>
        ))
      )}
      <div className="tiny muted" style={{ marginTop: 10 }}>
        A previsão parte do saldo atual e considera tudo que está cadastrado e ainda não foi pago/recebido (recorrências, parcelas, faturas, financiamentos e dívidas).
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Minha situação financeira
// ---------------------------------------------------------------------------

export function Insights() {
  const data = useData()
  const avg = averageMonthly(data)
  const fc = forecast(data, 12)
  const next = fc[0]
  const nextMonths = fc.slice(0, 3)
  const avgIncomeNext = nextMonths.reduce((a, m) => a + m.income, 0) / nextMonths.length
  const income = avg.income || avgIncomeNext
  const instNext = next.purchases + next.debts
  const finNext = next.financings
  const heaviest = [...fc].sort((a, b) => b.totalOut - a.totalOut).slice(0, 3)
  const negMonths = fc.filter((m) => m.balance < 0)

  // gastos variáveis (não recorrentes, não parcelas) dos últimos 3 meses
  const cur = monthKey(today())
  const from = addMonthKey(cur, -3) + '-01'
  const variable = data.transactions.filter(
    (t) => t.kind === 'out' && t.date >= from && t.date < cur + '-01' && t.source.type === 'manual' && !isInstallment(t),
  )
  const monthsWithData = new Set(variable.map((t) => monthKey(t.date))).size || 1
  const byCat = new Map<string, number>()
  for (const t of variable) byCat.set(t.categoryId ?? 'outros-out', (byCat.get(t.categoryId ?? 'outros-out') ?? 0) + t.amount / monthsWithData)
  const variableMonthly = round2([...byCat.values()].reduce((a, b) => a + b, 0))
  const saving10 = round2(variableMonthly * 0.1)
  const saving20 = round2(variableMonthly * 0.2)
  const catName = (id: string) => {
    const c = data.categories.find((x) => x.id === id)
    return c ? `${c.icon} ${c.name}` : id
  }
  const lines: { icon: string; text: React.ReactNode; tone?: string }[] = []
  if (income > 0) {
    const pctInst = (instNext + finNext) / income
    lines.push({
      icon: pctInst > 0.4 ? '🚨' : pctInst > 0.3 ? '⚠️' : '✅',
      tone: pctInst > 0.4 ? 'neg' : pctInst > 0.3 ? 'warn' : 'pos',
      text: (
        <>
          Parcelas e financiamentos comprometem <b>{fmtPct(pctInst, 0)}</b> da sua renda no próximo mês.
          {pctInst > 0.3 ? ' O ideal é ficar abaixo de 30%.' : ' Dentro do recomendado (até 30%).'}
        </>
      ),
    })
  }
  if (negMonths.length)
    lines.push({
      icon: '📉',
      tone: 'neg',
      text: (
        <>
          O saldo projetado fica negativo em <b>{negMonths.map((m) => monthLabel(m.month, true)).join(', ')}</b>. Reveja gastos ou antecipe receitas.
        </>
      ),
    })
  else if (fc.length) lines.push({ icon: '📈', tone: 'pos', text: <>Saldo projetado positivo nos próximos 12 meses. Em {monthLabel(fc[fc.length - 1].month, true)}: <b>{fmtBRL(fc[fc.length - 1].balance)}</b>.</> })
  if (avg.leftover > 0) lines.push({ icon: '💡', text: <>Em média sobram <b>{fmtBRL(avg.leftover)}</b> por mês.</> })
  else if (avg.income > 0) lines.push({ icon: '⚠️', tone: 'warn', text: <>Em média você gasta <b>{fmtBRL(-avg.leftover)}</b> a mais do que recebe por mês.</> })
  if (variableMonthly > 0)
    lines.push({
      icon: '✂️',
      text: (
        <>
          Cortando 10% dos gastos variáveis você economizaria <b>{fmtBRL(saving10)}/mês</b> ({fmtBRL(saving10 * 12)} por ano). Com 20%: <b>{fmtBRL(saving20)}/mês</b>.
        </>
      ),
    })
  const reserve = reserveValue(data)
  if (avg.expenses > 0)
    lines.push({
      icon: '🛟',
      tone: reserve / avg.expenses >= 6 ? 'pos' : 'warn',
      text: <>Sua reserva cobre <b>{(reserve / avg.expenses).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} meses</b> de despesas (recomendado: 6 ou mais).</>,
    })

  const finTotal = data.financings.reduce((a, f) => a + summarizeFinancing(f).totalRemaining, 0)
  return (
    <div className="screen">
      <TopBar title="Minha situação financeira" showBack />
      <div className="grid2">
        <Stat label="Entra por mês (média)" value={avg.income || avgIncomeNext} tone="pos" hint={avg.basis && avg.income ? `Base: ${avg.basis} mês(es)` : 'Pela previsão'} />
        <Stat label="Sai por mês (média)" value={avg.expenses} tone="neg" />
        <Stat label="Parcelas (próx. mês)" value={instNext} hint={income ? fmtPct(instNext / income, 0) + ' da renda' : undefined} />
        <Stat label="Financiamentos (próx. mês)" value={finNext} hint={income ? fmtPct(finNext / income, 0) + ' da renda' : undefined} />
        <Stat label="Sobra média" value={avg.leftover} tone={avg.leftover >= 0 ? 'pos' : 'neg'} />
        <Stat label="Saldo atual" value={currentBalance(data)} />
      </div>

      <Section title="Análise" />
      <div className="card tight">
        {lines.length ? (
          lines.map((l, i) => (
            <div key={i} className="list-item">
              <div className="ic">{l.icon}</div>
              <div className="main small" style={{ whiteSpace: 'normal' }}>
                {l.text}
              </div>
            </div>
          ))
        ) : (
          <div className="empty">Cadastre entradas e saídas para ver a análise.</div>
        )}
      </div>

      <Section title="Próximos meses" action="Detalhar" onAction={() => navigate('planejamento')} />
      <div className="card">
        {nextMonths.map((m) => (
          <KV key={m.month} k={monthLabel(m.month)} v={<>entra {fmtBRL(m.income)} · sai {fmtBRL(m.totalOut)}</>} />
        ))}
        <KV k="Ainda a pagar em financiamentos" v={fmtBRL(finTotal)} total />
      </div>

      <Section title="Meses com maior comprometimento" />
      <div className="card">
        {heaviest.map((m) => (
          <KV key={m.month} k={monthLabel(m.month)} v={<>{fmtBRL(m.totalOut)}{m.income ? ` · ${fmtPct(m.totalOut / m.income, 0)} da renda` : ''}</>} />
        ))}
      </div>

      {byCat.size > 0 && (
        <>
          <Section title="Onde dá para economizar (gastos variáveis/mês)" />
          <div className="card">
            <HBars items={[...byCat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => ({ key: k, label: catName(k), value: round2(v) }))} />
          </div>
        </>
      )}

      {data.goals.length > 0 && (
        <>
          <Section title="Tempo para atingir as metas" />
          <div className="card">
            {data.goals.map((g) => {
              const p = goalProgress(g)
              const m = g.monthly ? p.months : avg.leftover > 0 ? monthsToGoal(p.remaining, avg.leftover) : Infinity
              return (
                <KV
                  key={g.id}
                  k={`${g.icon} ${g.name}`}
                  v={p.remaining <= 0 ? 'Atingida 🏆' : Number.isFinite(m) ? `${m} meses${g.monthly ? '' : ' (com a sobra média)'}` : 'Defina um valor mensal'}
                />
              )
            })}
          </div>
        </>
      )}
      <div className="tiny muted" style={{ marginTop: 12 }}>
        Este painel apenas organiza e analisa seus dados. Nenhum dinheiro é movimentado e nenhum investimento é feito automaticamente.
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Alertas
// ---------------------------------------------------------------------------

export function Alerts() {
  const data = useData()
  const alerts = computeAlerts(data)
  return (
    <div className="screen">
      <TopBar
        title="Alertas"
        showBack
        right={
          <button className="icon-btn" onClick={() => navigate('ajustes')} aria-label="Configurar alertas">
            ⚙️
          </button>
        }
      />
      {alerts.length ? (
        <div className="card tight">
          {alerts.map((a) => (
            <div key={a.id} className="list-item" role="button" onClick={() => a.link && navigate(a.link)}>
              <div className="ic" style={{ background: `var(--${a.level === 'danger' ? 'neg' : a.level === 'warning' ? 'warn' : a.level === 'success' ? 'pos' : 'info'}-soft)` }}>
                {a.icon}
              </div>
              <div className="main">
                <div className="title" style={{ whiteSpace: 'normal' }}>
                  {a.title}
                </div>
                <div className="meta">{a.detail}</div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card">
          <Empty icon="🔕" title="Tudo em dia" text="Nenhum alerta no momento." />
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Pesquisa e filtros
// ---------------------------------------------------------------------------

type KindFilter = 'todos' | 'in' | 'out' | 'transfer'
interface Filters {
  q: string
  kind: KindFilter
  from: string
  to: string
  category: string
  method: string
  account: string
  card: string
  status: 'todos' | 'pago' | 'pendente'
  source: string
  platform: string
}

export function Search() {
  const data = useData()
  const [f, setF] = useState<Filters>({ q: '', kind: 'todos', from: '', to: '', category: '', method: '', account: '', card: '', status: 'todos', source: '', platform: '' })
  const [open, setOpen] = useState(false)
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setF((p) => ({ ...p, [k]: v }))
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const purchasePlatform = useMemo(() => new Map(data.purchases.map((p) => [p.id, p.platform])), [data.purchases])
  const results = useMemo(() => {
    const q = norm(f.q.trim())
    return data.transactions
      .filter((t) => {
        if (f.kind !== 'todos' && t.kind !== f.kind) return false
        if (f.from && t.date < f.from) return false
        if (f.to && t.date > f.to) return false
        if (f.category && t.categoryId !== f.category) return false
        if (f.method && (t.cardId ? 'Crédito' : t.method) !== f.method) return false
        if (f.account && t.accountId !== f.account) return false
        if (f.card && t.cardId !== f.card) return false
        if (f.status === 'pago' && !t.paid) return false
        if (f.status === 'pendente' && t.paid) return false
        if (f.source && t.source.type !== f.source) return false
        if (f.platform && (t.source.type !== 'purchase' || purchasePlatform.get(t.source.id!) !== f.platform)) return false
        if (q) {
          const cat = data.categories.find((c) => c.id === t.categoryId)?.name ?? ''
          const hay = norm([t.description, t.note, t.origin, cat, t.subcategory, t.method, String(t.amount).replace('.', ',')].filter(Boolean).join(' '))
          if (!hay.includes(q)) return false
        }
        return true
      })
      .sort((a, b) => b.date.localeCompare(a.date))
  }, [data, f, purchasePlatform])
  const tot = (k: Transaction['kind']) => sum(results.filter((t) => t.kind === k).map((t) => t.amount))
  const activeCount = Object.entries(f).filter(([k, v]) => k !== 'q' && v && v !== 'todos').length
  return (
    <div className="screen">
      <TopBar title="Pesquisar" showBack />
      <input className="input" placeholder="Buscar descrição, categoria, valor…" value={f.q} onChange={(e) => set('q', e.target.value)} autoFocus />
      <div className="spacer" />
      <div className="chips">
        {(
          [
            ['todos', 'Tudo'],
            ['in', 'Entradas'],
            ['out', 'Saídas'],
            ['transfer', 'Transferências'],
          ] as const
        ).map(([v, l]) => (
          <button key={v} className={`chip ${f.kind === v ? 'on' : ''}`} onClick={() => set('kind', v)}>
            {l}
          </button>
        ))}
        <button className={`chip ${open ? 'on' : ''}`} onClick={() => setOpen(!open)}>
          ⚙️ Filtros {activeCount ? `(${activeCount})` : ''}
        </button>
      </div>
      {open && (
        <div className="card" style={{ marginBottom: 10 }}>
          <div className="two">
            <label className="field">
              <span>De</span>
              <input type="date" value={f.from} onChange={(e) => set('from', e.target.value)} />
            </label>
            <label className="field">
              <span>Até</span>
              <input type="date" value={f.to} onChange={(e) => set('to', e.target.value)} />
            </label>
          </div>
          <div className="two">
            <label className="field">
              <span>Categoria</span>
              <select value={f.category} onChange={(e) => set('category', e.target.value)}>
                <option value="">Todas</option>
                {data.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.icon} {c.name} ({c.kind === 'in' ? 'entrada' : 'saída'})
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Forma de pagamento</span>
              <select value={f.method} onChange={(e) => set('method', e.target.value)}>
                <option value="">Todas</option>
                {data.methods.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="two">
            <label className="field">
              <span>Conta</span>
              <select value={f.account} onChange={(e) => set('account', e.target.value)}>
                <option value="">Todas</option>
                {data.accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Cartão</span>
              <select value={f.card} onChange={(e) => set('card', e.target.value)}>
                <option value="">Todos</option>
                {data.cards.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="two">
            <label className="field">
              <span>Tipo de lançamento</span>
              <select value={f.source} onChange={(e) => set('source', e.target.value)}>
                <option value="">Todos</option>
                <option value="manual">Avulso</option>
                <option value="recurring">Recorrente</option>
                <option value="purchase">Compra</option>
                <option value="debt">Dívida</option>
                <option value="financing">Financiamento</option>
              </select>
            </label>
            <label className="field">
              <span>Plataforma</span>
              <select value={f.platform} onChange={(e) => set('platform', e.target.value)}>
                <option value="">Todas</option>
                {data.platforms.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="field">
            <span>Situação</span>
            <Seg
              options={[
                { value: 'todos', label: 'Todos' },
                { value: 'pago', label: 'Pago' },
                { value: 'pendente', label: 'Pendente' },
              ]}
              value={f.status}
              onChange={(v) => set('status', v)}
            />
          </label>
          <button className="btn secondary sm" onClick={() => setF({ q: f.q, kind: 'todos', from: '', to: '', category: '', method: '', account: '', card: '', status: 'todos', source: '', platform: '' })}>
            Limpar filtros
          </button>
        </div>
      )}
      <div className="between small" style={{ margin: '6px 2px' }}>
        <span className="muted">{results.length} resultado(s)</span>
        <span>
          <Money value={tot('in')} className="pos" /> · <Money value={-tot('out')} />
        </span>
      </div>
      {results.length ? <TxGroups txs={results.slice(0, 300)} /> : <div className="card"><Empty icon="🔍" title="Nada encontrado" /></div>}
      {results.length > 0 && (
        <button className="btn secondary" style={{ marginTop: 12 }} onClick={() => downloadFile('lancamentos-filtrados.csv', transactionsCSV(data, results), 'text/csv;charset=utf-8')}>
          ⬇️ Exportar resultados (Excel/CSV)
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Relatórios
// ---------------------------------------------------------------------------

export function Reports() {
  const data = useData()
  const [mode, setMode] = useState<'mensal' | 'anual'>('mensal')
  const [month, setMonth] = useState(monthKey(today()))
  const [year, setYear] = useState(today().slice(0, 4))
  const start = mode === 'mensal' ? month + '-01' : `${year}-01-01`
  const end = mode === 'mensal' ? `${month}-31` : `${year}-12-31`
  const s = periodStats(data, { start, end })
  const txs = data.transactions.filter((t) => t.date >= start && t.date <= end)
  const outs = txs.filter((t) => t.kind === 'out')
  const byCard = new Map<string, number>()
  for (const t of outs) if (t.cardId) byCard.set(t.cardId, (byCard.get(t.cardId) ?? 0) + t.amount)
  const byPlatform = new Map<string, number>()
  for (const t of outs) {
    if (t.source.type !== 'purchase') continue
    const p = data.purchases.find((x) => x.id === t.source.id)?.platform
    if (p) byPlatform.set(p, (byPlatform.get(p) ?? 0) + t.amount)
  }
  // juros pagos no período (financiamentos pagos)
  let interestPaid = 0
  for (const f of data.financings) {
    const sm = summarizeFinancing(f)
    const paidKs = new Set(
      data.transactions.filter((t) => t.source.type === 'financing' && t.source.id === f.id && t.paid && t.date >= start && t.date <= end).map((t) => t.installment?.n),
    )
    for (const r of sm.schedule) if (paidKs.has(r.k)) interestPaid += r.interest
  }
  // evolução patrimonial simples e das dívidas
  const months = mode === 'mensal' ? Array.from({ length: 6 }, (_, i) => addMonthKey(month, i - 5)) : Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`)
  const patrimony = months.map((m) => {
    const endM = `${m}-31`
    const debtLeft = sum(data.transactions.filter((t) => t.kind === 'out' && (t.source.type === 'debt' || t.source.type === 'financing' || (t.installment && t.installment.total > 1)) && t.date > endM).map((t) => t.amount))
    const finLeft = sum(data.transactions.filter((t) => t.source.type === 'financing' && t.date > endM).map((t) => t.amount))
    const reserve = sum(data.reserve.entries.filter((e) => e.date <= endM).map((e) => e.amount))
    const goals = sum(data.goals.flatMap((g) => [g.initial, ...g.entries.filter((e) => e.date <= endM).map((e) => e.amount)]))
    const cash = balanceAt(data, endM)
    return { m, cash, debtLeft, finLeft, net: round2(cash + reserve + goals - debtLeft) }
  })
  const catName = (id: string) => {
    const c = data.categories.find((x) => x.id === id)
    return c ? `${c.icon} ${c.name}` : id
  }
  const label = mode === 'mensal' ? monthLabel(month) : year

  const exportSummary = async () => {
    const rows: (string | number)[][] = [
      ['Relatório', label],
      [],
      ['Total de entradas', s.income],
      ['Total de despesas', s.expenses],
      ['Total de parcelas', s.installments],
      ['Juros pagos (financiamentos)', round2(interestPaid)],
      [],
      ['Categoria', 'Valor'],
      ...s.byCategory.map((c) => [catName(c.id).replace(/^\S+\s/, ''), c.value]),
      [],
      ['Cartão', 'Valor'],
      ...[...byCard.entries()].map(([k, v]) => [data.cards.find((c) => c.id === k)?.name ?? k, v]),
      [],
      ['Plataforma', 'Valor'],
      ...[...byPlatform.entries()],
      [],
      ['Mês', 'Saldo em contas', 'Dívidas a pagar', 'Financiamentos a pagar', 'Patrimônio líquido simples'],
      ...patrimony.map((p) => [p.m, p.cash, p.debtLeft, p.finLeft, p.net]),
    ]
    try {
      await shareFile(`relatorio-${label.replace(/\s/g, '-')}.csv`, toCSV(rows), 'text/csv')
    } catch {
      /* cancelado */
    }
  }
  return (
    <div className="screen">
      <TopBar title="Relatórios" showBack />
      <Seg
        options={[
          { value: 'mensal', label: 'Mensal' },
          { value: 'anual', label: 'Anual' },
        ]}
        value={mode}
        onChange={setMode}
      />
      <div className="between" style={{ margin: '10px 0' }}>
        <button className="icon-btn no-print" onClick={() => (mode === 'mensal' ? setMonth(addMonthKey(month, -1)) : setYear(String(Number(year) - 1)))} aria-label="Anterior">
          ‹
        </button>
        <b>{label}</b>
        <button className="icon-btn no-print" onClick={() => (mode === 'mensal' ? setMonth(addMonthKey(month, 1)) : setYear(String(Number(year) + 1)))} aria-label="Próximo">
          ›
        </button>
      </div>
      <div className="grid2">
        <Stat label="Entradas" value={s.income} tone="pos" />
        <Stat label="Despesas" value={s.expenses} tone="neg" />
        <Stat label="Parcelas" value={s.installments} />
        <Stat label="Juros pagos" value={round2(interestPaid)} tone="warn" />
      </div>
      <div className="card" style={{ marginTop: 10 }}>
        <KV k="Resultado do período" v={<Money value={s.income - s.expenses} signed colored />} />
        <KV k="Taxa de economia" v={s.income > 0 ? fmtPct((s.income - s.expenses) / s.income, 0) : '—'} />
      </div>
      <Section title="Gasto por categoria" />
      <div className="card">{s.byCategory.length ? <HBars items={s.byCategory.map((c) => ({ key: c.id, label: catName(c.id), value: c.value }))} /> : <div className="small muted">Sem dados</div>}</div>
      {byCard.size > 0 && (
        <>
          <Section title="Gasto por cartão" />
          <div className="card">
            <HBars items={[...byCard.entries()].map(([k, v]) => ({ key: k, label: data.cards.find((c) => c.id === k)?.name ?? k, value: v }))} />
          </div>
        </>
      )}
      {byPlatform.size > 0 && (
        <>
          <Section title="Gasto por plataforma" />
          <div className="card">
            <HBars items={[...byPlatform.entries()].map(([k, v]) => ({ key: k, label: k, value: v }))} />
          </div>
        </>
      )}
      <Section title="Evolução patrimonial simples" />
      <div className="card">
        <LineChart points={patrimony.map((p) => ({ label: monthLabel(p.m, true).split('/')[0], value: p.net }))} label="Patrimônio líquido (contas + reserva + metas − dívidas)" />
      </div>
      <Section title="Evolução das dívidas e financiamentos" />
      <div className="card">
        <GroupedBars
          data={patrimony.map((p) => ({ label: monthLabel(p.m, true).split('/')[0], values: { d: round2(p.debtLeft - p.finLeft), f: p.finLeft } }))}
          series={[
            { key: 'd', label: 'Dívidas e parcelas a pagar', color: 'var(--s2)' },
            { key: 'f', label: 'Financiamentos a pagar', color: 'var(--s3)' },
          ]}
        />
      </div>
      <Section title="Exportar" />
      <div className="stack no-print">
        <button className="btn secondary" onClick={() => downloadFile(`lancamentos-${label.replace(/\s/g, '-')}.csv`, transactionsCSV(data, txs), 'text/csv;charset=utf-8')}>
          📗 Lançamentos do período (Excel/CSV)
        </button>
        <button className="btn secondary" onClick={exportSummary}>
          📊 Resumo do relatório (Excel/CSV)
        </button>
        <button className="btn secondary" onClick={() => downloadFile('todos-os-lancamentos.csv', transactionsCSV(data), 'text/csv;charset=utf-8')}>
          🗂️ Todos os lançamentos (Excel/CSV)
        </button>
        <button
          className="btn secondary"
          onClick={() => {
            toast('Escolha “Salvar como PDF” na janela de impressão')
            setTimeout(() => window.print(), 300)
          }}
        >
          📄 Salvar relatório em PDF
        </button>
      </div>
    </div>
  )
}
