// Mais, Compras, Cartões, Contas, Dívidas e Compromissos, Contas recorrentes.
import { useState } from 'react'
import { useData } from '../store'
import { Empty, KV, Money, Progress, Section, Seg, Stat, TopBar, openForm } from '../components/ui'
import { HBars } from '../components/charts'
import { TxRow } from '../components/TxRow'
import { navigate } from '../router'
import { fmtDate, fmtDateShort, today } from '../lib/dates'
import { fmtBRL, splitInstallments, sum } from '../lib/money'
import { accountBalance, bucketOf, cardInvoices, computeAlerts } from '../lib/projections'
import type { PurchaseStatus } from '../lib/types'

const MENU: { path: string; icon: string; label: string }[] = [
  { path: 'situacao', icon: '🧠', label: 'Minha situação' },
  { path: 'planejamento', icon: '🗓️', label: 'Próximos meses' },
  { path: 'compromissos', icon: '📄', label: 'Dívidas e compromissos' },
  { path: 'compras', icon: '🛍️', label: 'Compras' },
  { path: 'recorrentes', icon: '🔄', label: 'Contas recorrentes' },
  { path: 'contas', icon: '🏦', label: 'Contas' },
  { path: 'reserva', icon: '🛟', label: 'Reserva' },
  { path: 'alertas', icon: '🔔', label: 'Alertas' },
  { path: 'pesquisa', icon: '🔍', label: 'Pesquisar' },
  { path: 'relatorios', icon: '📊', label: 'Relatórios' },
  { path: 'ajustes', icon: '⚙️', label: 'Ajustes e backup' },
]

export function More() {
  const data = useData()
  const alerts = computeAlerts(data).filter((a) => a.level === 'danger' || a.level === 'warning').length
  const days = data.settings.lastBackup ? Math.floor((Date.now() - data.settings.lastBackup) / 86400000) : null
  return (
    <div className="screen">
      <TopBar title="Mais" />
      <div className="menu-grid">
        {MENU.map((m) => (
          <button key={m.path} onClick={() => navigate(m.path)}>
            <span className="i">{m.icon}</span>
            {m.label}
            {m.path === 'alertas' && alerts > 0 && <span className="badge neg">{alerts}</span>}
          </button>
        ))}
      </div>
      <div className="spacer" />
      {(days == null || days > 7) && data.transactions.length > 0 && (
        <div className="note warn" role="button" onClick={() => navigate('ajustes')}>
          💾 {days == null ? 'Você ainda não fez nenhum backup.' : `Último backup há ${days} dias.`} Toque para salvar uma cópia (e-mail, Drive ou iCloud).
        </div>
      )}
      <div className="tiny muted center" style={{ marginTop: 16 }}>
        Seus dados ficam somente neste aparelho. 🔒
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Compras
// ---------------------------------------------------------------------------

const STATUS_LABEL: Record<PurchaseStatus, { label: string; cls: string }> = {
  aguardando: { label: 'Aguardando', cls: 'warn' },
  enviado: { label: 'Enviado', cls: 'info' },
  entregue: { label: 'Entregue', cls: 'pos' },
  cancelado: { label: 'Cancelado', cls: '' },
  devolvido: { label: 'Devolvido', cls: '' },
}

export function Purchases() {
  const data = useData()
  const [filter, setFilter] = useState<'todas' | 'parceladas' | 'pendentes' | 'entrega'>('todas')
  const all = [...data.purchases].filter((p) => p.platform).sort((a, b) => b.date.localeCompare(a.date))
  const unpaidOf = (id: string) => sum(data.transactions.filter((t) => t.source.type === 'purchase' && t.source.id === id && !t.paid).map((t) => t.amount))
  const active = all.filter((p) => p.status !== 'cancelado' && p.status !== 'devolvido')
  const list = all.filter((p) =>
    filter === 'parceladas' ? p.installments > 1 : filter === 'pendentes' ? unpaidOf(p.id) > 0 : filter === 'entrega' ? p.status === 'aguardando' || p.status === 'enviado' : true,
  )
  const byPlatform = new Map<string, number>()
  for (const p of active) byPlatform.set(p.platform, (byPlatform.get(p.platform) ?? 0) + p.total)
  const totalUnpaid = sum(active.map((p) => unpaidOf(p.id)))
  return (
    <div className="screen">
      <TopBar
        title="Compras"
        showBack
        right={
          <button className="icon-btn" onClick={() => openForm({ type: 'compra' })} aria-label="Nova compra">
            ＋
          </button>
        }
      />
      <div className="grid2">
        <Stat label="Total comprado" value={sum(active.map((p) => p.total))} />
        <Stat label="Ainda a pagar" value={totalUnpaid} tone={totalUnpaid > 0 ? 'warn' : undefined} />
      </div>
      {byPlatform.size > 0 && (
        <>
          <Section title="Total por plataforma" />
          <div className="card">
            <HBars items={[...byPlatform.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ key: k, label: k, value: v }))} />
          </div>
        </>
      )}
      <div className="spacer" />
      <div className="chips">
        {(
          [
            ['todas', 'Histórico'],
            ['parceladas', 'Parceladas'],
            ['pendentes', 'Não pagas'],
            ['entrega', 'A caminho'],
          ] as const
        ).map(([v, l]) => (
          <button key={v} className={`chip ${filter === v ? 'on' : ''}`} onClick={() => setFilter(v)}>
            {l}
          </button>
        ))}
      </div>
      {list.length ? (
        <div className="card tight">
          {list.map((p) => {
            const card = data.cards.find((c) => c.id === p.cardId)
            const paidN = data.transactions.filter((t) => t.source.type === 'purchase' && t.source.id === p.id && t.paid).length
            const st = STATUS_LABEL[p.status]
            return (
              <div key={p.id} className="list-item" role="button" onClick={() => openForm({ type: 'compra', id: p.id })}>
                <div className="ic">🛍️</div>
                <div className="main">
                  <div className="title">{p.product || p.platform}</div>
                  <div className="meta">
                    {p.platform} · {fmtDateShort(p.date)} · {card ? card.name : p.method}
                    {p.installments > 1 && ` · ${paidN}/${p.installments} pagas`}
                  </div>
                  {p.deliveryDate && (p.status === 'aguardando' || p.status === 'enviado') && <div className="meta">📦 Entrega prevista {fmtDate(p.deliveryDate)}</div>}
                </div>
                <div className="end">
                  <div className="amount">
                    <Money value={p.total} />
                  </div>
                  {p.installments > 1 && (
                    <div className="tiny muted">
                      {p.installments}x <Money value={splitInstallments(p.total, p.installments)[1]} />
                    </div>
                  )}
                  <span className={`badge ${st.cls}`}>{st.label}</span>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="card">
          <Empty icon="🛍️" title="Nenhuma compra aqui" text="Registre compras do Mercado Livre, Amazon, Shopee, lojas físicas…" action="+ Nova compra" onAction={() => openForm({ type: 'compra' })} />
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Contas bancárias
// ---------------------------------------------------------------------------

export function Accounts() {
  const data = useData()
  const accs = data.accounts.filter((a) => !a.archived)
  return (
    <div className="screen">
      <TopBar
        title="Contas"
        showBack
        right={
          <button className="icon-btn" onClick={() => openForm({ type: 'conta' })} aria-label="Nova conta">
            ＋
          </button>
        }
      />
      <div className="card tight">
        {accs.map((a) => (
          <div key={a.id} className="list-item" role="button" onClick={() => openForm({ type: 'conta', id: a.id })}>
            <div className="ic">{a.type === 'carteira' ? '👛' : a.type === 'poupanca' ? '🐷' : a.type === 'investimento' ? '📈' : '🏦'}</div>
            <div className="main">
              <div className="title">{a.name}</div>
              <div className="meta">Saldo inicial em {fmtDate(a.balanceDate)}</div>
            </div>
            <div className="end amount">
              <Money value={accountBalance(data, a.id)} colored />
            </div>
          </div>
        ))}
      </div>
      <div className="spacer" />
      <button className="btn secondary" onClick={() => openForm({ type: 'transferencia' })}>
        🔁 Transferir entre contas
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Dívidas e compromissos
// ---------------------------------------------------------------------------

const BUCKETS = [
  { key: 'vencidas', label: 'Vencidas', cls: 'neg' },
  { key: 'hoje', label: 'Vencendo hoje', cls: 'warn' },
  { key: '7dias', label: 'Próximos 7 dias', cls: 'warn' },
  { key: '30dias', label: 'Próximos 30 dias', cls: 'info' },
  { key: 'futuras', label: 'Futuras', cls: '' },
  { key: 'pagas', label: 'Pagas', cls: 'pos' },
] as const

export function Commitments() {
  const data = useData()
  const [tab, setTab] = useState<'situacao' | 'dividas'>('situacao')
  const [bucket, setBucket] = useState<string>('vencidas')
  const t0 = today()
  const outs = data.transactions.filter((t) => t.kind === 'out' && !t.cardId)
  // faturas de cartão entram como um compromisso único por fatura
  const counts = new Map<string, number>()
  for (const t of outs) counts.set(bucketOf(t, t0), (counts.get(bucketOf(t, t0)) ?? 0) + 1)
  const list = outs
    .filter((t) => bucketOf(t, t0) === bucket)
    .sort((a, b) => (bucket === 'pagas' ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date)))
    .slice(0, bucket === 'futuras' || bucket === 'pagas' ? 60 : 200)
  const invoicesOpen = data.cards.flatMap((c) =>
    cardInvoices(data, c)
      .filter((i) => !i.paid && i.dueDate <= t0.slice(0, 8) + '31')
      .map((i) => ({ c, i })),
  )
  const totalOf = (k: string) => sum(outs.filter((t) => bucketOf(t, t0) === k).map((t) => t.amount))
  return (
    <div className="screen">
      <TopBar
        title="Dívidas e compromissos"
        showBack
        right={
          <button className="icon-btn" onClick={() => openForm({ type: 'divida' })} aria-label="Nova dívida">
            ＋
          </button>
        }
      />
      <Seg
        options={[
          { value: 'situacao', label: 'Por situação' },
          { value: 'dividas', label: 'Minhas dívidas' },
        ]}
        value={tab}
        onChange={setTab}
      />
      <div className="spacer" />
      {tab === 'situacao' ? (
        <>
          <div className="chips">
            {BUCKETS.map((b) => (
              <button key={b.key} className={`chip ${bucket === b.key ? 'on' : ''}`} onClick={() => setBucket(b.key)}>
                {b.label} {counts.get(b.key) ? `(${counts.get(b.key)})` : ''}
              </button>
            ))}
          </div>
          <div className="card stat" style={{ marginBottom: 10 }}>
            <div className="label">Total — {BUCKETS.find((b) => b.key === bucket)?.label}</div>
            <div className={`value ${BUCKETS.find((b) => b.key === bucket)?.cls}`}>
              <Money value={totalOf(bucket)} />
            </div>
          </div>
          {list.length ? (
            <div className="card tight">
              {list.map((t) => (
                <TxRow key={t.id} t={t} />
              ))}
            </div>
          ) : (
            <div className="card small muted center">Nada por aqui ✨</div>
          )}
          {invoicesOpen.length > 0 && (
            <>
              <Section title="Faturas de cartão em aberto" />
              <div className="card tight">
                {invoicesOpen.map(({ c, i }) => (
                  <div key={c.id + i.month} className="list-item" role="button" onClick={() => navigate('cartoes/' + c.id)}>
                    <div className="ic">💳</div>
                    <div className="main">
                      <div className="title">Fatura {c.name}</div>
                      <div className="meta">Vence {fmtDate(i.dueDate)}</div>
                    </div>
                    <div className="end amount">
                      <Money value={i.total - i.paidTotal} />
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      ) : data.debts.length ? (
        data.debts.map((d) => {
          const txs = data.transactions.filter((t) => t.source.type === 'debt' && t.source.id === d.id)
          const paid = txs.filter((t) => t.paid).length
          const remaining = sum(txs.filter((t) => !t.paid).map((t) => t.amount))
          const next = txs.filter((t) => !t.paid).sort((a, b) => a.date.localeCompare(b.date))[0]
          const total = d.recurring ? d.installments : 1
          return (
            <div key={d.id} className="card" role="button" style={{ cursor: 'pointer' }} onClick={() => openForm({ type: 'divida', id: d.id })}>
              <div className="between">
                <div>
                  <div className="bold">{d.name}</div>
                  <div className="tiny muted">
                    {d.creditor || 'Credor'} · {d.recurring ? (d.installments ? `${paid}/${d.installments} pagas` : 'mensal sem prazo') : 'única'}
                    {d.interest ? ` · ${(d.interest * 100).toLocaleString('pt-BR')}% a.m.` : ''}
                  </div>
                </div>
                <span className={`badge ${d.status === 'quitada' || remaining === 0 ? 'pos' : d.status === 'negociando' ? 'warn' : 'info'}`}>
                  {remaining === 0 ? 'Quitada' : d.status === 'negociando' ? 'Negociando' : 'Ativa'}
                </span>
              </div>
              {total > 1 && (
                <div style={{ margin: '10px 0 6px' }}>
                  <Progress pct={paid / total} tone="pos" />
                </div>
              )}
              <KV k="Valor" v={fmtBRL(d.amount)} />
              <KV k="Parcelas restantes" v={d.recurring && d.installments ? d.installments - paid : !d.recurring ? 1 - paid : '—'} />
              <KV k="Falta pagar" v={fmtBRL(remaining)} />
              {next && <KV k="Próximo vencimento" v={fmtDate(next.date)} />}
            </div>
          )
        })
      ) : (
        <div className="card">
          <Empty icon="📄" title="Nenhuma dívida cadastrada" text="Empréstimos, acordos, carnês e boletos parcelados." action="+ Nova dívida" onAction={() => openForm({ type: 'divida' })} />
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Contas recorrentes
// ---------------------------------------------------------------------------

export function Recurring() {
  const data = useData()
  const outs = data.recurrences.filter((r) => r.kind === 'out')
  const ins = data.recurrences.filter((r) => r.kind === 'in')
  const monthlyFactor: Record<string, number> = { mensal: 1, semanal: 52 / 12, quinzenal: 26 / 12, bimestral: 1 / 2, trimestral: 1 / 3, semestral: 1 / 6, anual: 1 / 12 }
  const totalOut = sum(outs.filter((r) => r.active).map((r) => r.amount * monthlyFactor[r.frequency]))
  const totalIn = sum(ins.filter((r) => r.active).map((r) => r.amount * monthlyFactor[r.frequency]))
  const row = (r: (typeof data.recurrences)[number]) => {
    const cat = data.categories.find((c) => c.id === r.categoryId)
    return (
      <div key={r.id} className="list-item" role="button" onClick={() => openForm({ type: 'recorrente', id: r.id })} style={{ opacity: r.active ? 1 : 0.5 }}>
        <div className="ic">{cat?.icon ?? (r.kind === 'in' ? '💰' : '🔄')}</div>
        <div className="main">
          <div className="title">{r.description}</div>
          <div className="meta">
            {r.frequency === 'mensal' ? `Todo dia ${r.day}` : r.frequency} {r.variable ? '· valor variável' : ''} {r.end ? `· até ${fmtDate(r.end)}` : ''}
            {!r.active && ' · pausada'}
          </div>
        </div>
        <div className="end amount">
          {r.amount === 0 ? (
            <span className="badge warn">definir valor</span>
          ) : (
            <Money value={r.kind === 'in' ? r.amount : -r.amount} className={r.kind === 'in' ? 'pos' : ''} />
          )}
        </div>
      </div>
    )
  }
  return (
    <div className="screen">
      <TopBar
        title="Contas recorrentes"
        showBack
        right={
          <button className="icon-btn" onClick={() => openForm({ type: 'recorrente' })} aria-label="Nova">
            ＋
          </button>
        }
      />
      <div className="grid2">
        <Stat label="Despesas fixas / mês" value={totalOut} tone="neg" />
        <Stat label="Receitas fixas / mês" value={totalIn} tone="pos" />
      </div>
      <div className="spacer" />
      <button className="btn secondary" onClick={() => openForm({ type: 'lote' })}>
        📋 Adicionar várias de uma vez
      </button>
      {outs.some((r) => r.amount === 0) && (
        <div className="note warn" style={{ marginTop: 10 }}>
          {outs.filter((r) => r.amount === 0).length} despesa(s) sem valor. Toque nelas para informar o valor.
        </div>
      )}
      <Section title="Despesas" />
      {outs.length ? <div className="card tight">{outs.map(row)}</div> : (
        <div className="card">
          <Empty icon="🔄" title="Nenhuma conta recorrente" text="Energia, água, internet, aluguel, streaming… lançadas automaticamente todo mês." action="+ Adicionar" onAction={() => openForm({ type: 'recorrente' })} />
        </div>
      )}
      <Section title="Receitas" />
      {ins.length ? <div className="card tight">{ins.map(row)}</div> : <div className="card small muted center">Ex.: salário todo dia 5 — cadastre em “+ Lançamento → Entrada → Recorrente”.</div>}
    </div>
  )
}
