// Aba Cartões: painel de limites e gastos de todos os cartões, e detalhe de cada cartão.
import { useState } from 'react'
import { actions, useData } from '../store'
import { Empty, KV, Money, Progress, Section, Stat, TopBar, openForm, toast } from '../components/ui'
import { HBars, StackedBars, type Series } from '../components/charts'
import { TxRow } from '../components/TxRow'
import { navigate } from '../router'
import { addMonthKey, fmtDate, fmtDateShort, monthKey, monthLabel, today } from '../lib/dates'
import { fmtBRL, round2, splitInstallments, sum } from '../lib/money'
import { cardInvoices, cardSpending, limitBreakdown } from '../lib/projections'
import { invoiceClosingDate } from '../lib/generate'
import type { AppData, Card } from '../lib/types'

const SERIES_COLORS = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)']

const usageTone = (pct: number) => (pct >= 0.9 ? 'neg' : pct >= 0.7 ? 'warn' : 'pos')

function MonthNav({ month, onChange }: { month: string; onChange: (m: string) => void }) {
  return (
    <div className="between" style={{ marginBottom: 10 }}>
      <button className="icon-btn" onClick={() => onChange(addMonthKey(month, -1))} aria-label="Mês anterior">
        ‹
      </button>
      <div className="bold">{monthLabel(month)}</div>
      <button className="icon-btn" onClick={() => onChange(addMonthKey(month, 1))} aria-label="Próximo mês">
        ›
      </button>
    </div>
  )
}

/** Total das faturas que vencem no mês, por cartão. */
function invoiceTotal(data: AppData, card: Card, month: string) {
  return cardInvoices(data, card).find((i) => i.month === month)?.total ?? 0
}

export function Cards() {
  const data = useData()
  const [month, setMonth] = useState(monthKey(today()))
  const cards = data.cards

  const addBtn = (
    <button className="icon-btn" onClick={() => openForm({ type: 'cartao' })} aria-label="Novo cartão">
      ＋
    </button>
  )
  if (!cards.length)
    return (
      <div className="screen">
        <TopBar title="Cartões" right={addBtn} />
        <div className="card">
          <Empty
            icon="💳"
            title="Nenhum cartão cadastrado"
            text="Cadastre seus cartões com limite, dia de fechamento e vencimento. O app controla o limite disponível e distribui as compras parceladas nas faturas."
            action="+ Novo cartão"
            onAction={() => openForm({ type: 'cartao' })}
          />
        </div>
      </div>
    )

  const rows = cards.map((c) => ({
    card: c,
    b: limitBreakdown(data, c),
    spent: cardSpending(data, month, c.id).total,
    invoice: invoiceTotal(data, c, month),
  }))
  const totalLimit = sum(cards.map((c) => c.limit))
  const totalUsed = sum(rows.map((r) => r.b.used))
  const totalAvail = round2(totalLimit - totalUsed)
  const pct = totalLimit > 0 ? totalUsed / totalLimit : 0
  const spentAll = cardSpending(data, month)
  const invoicesMonth = sum(rows.map((r) => r.invoice))
  const future = sum(rows.map((r) => r.b.future))
  const late = sum(rows.map((r) => r.b.closed))

  // faturas de 2 meses atrás até 3 meses à frente, empilhadas por cartão (4 cores + "Outros")
  const months = Array.from({ length: 6 }, (_, i) => addMonthKey(month, i - 2))
  const top = cards.slice(0, cards.length > 4 ? 3 : 4)
  const series: Series[] = top.map((c, i) => ({ key: c.id, label: c.name, color: SERIES_COLORS[i] }))
  if (cards.length > 4) series.push({ key: 'outros', label: 'Outros', color: 'var(--s4)' })
  const stacked = months.map((m) => {
    const values: Record<string, number> = {}
    for (const c of cards) {
      const k = top.includes(c) ? c.id : 'outros'
      values[k] = round2((values[k] ?? 0) + invoiceTotal(data, c, m))
    }
    return { label: monthLabel(m, true).split('/')[0], values }
  })
  const catName = (id: string) => {
    const c = data.categories.find((x) => x.id === id)
    return c ? `${c.icon} ${c.name}` : id
  }

  return (
    <div className="screen">
      <TopBar title="Cartões" right={addBtn} />

      <div className="card hero">
        <div className="label">Limite disponível (todos os cartões)</div>
        <div className="big">
          <Money value={totalAvail} />
        </div>
        <div className="limit-bar" aria-label={`${Math.round(pct * 100)}% do limite usado`}>
          <div style={{ width: `${Math.min(100, pct * 100)}%` }} />
        </div>
        <div className="row">
          <div className="pill">
            <small>Limite total</small>
            <b>
              <Money value={totalLimit} />
            </b>
          </div>
          <div className="pill">
            <small>Usado · {Math.round(pct * 100)}%</small>
            <b>
              <Money value={totalUsed} />
            </b>
          </div>
        </div>
      </div>

      <div className="spacer" />
      <MonthNav month={month} onChange={setMonth} />
      <div className="grid2">
        <Stat label="🛒 Gasto no mês" value={spentAll.total} hint="Compras feitas no mês" />
        <Stat label="🧾 Faturas do mês" value={invoicesMonth} hint="Vencem neste mês" />
        <Stat label="📆 Parcelas futuras" value={future} hint="Já comprometem o limite" />
        <Stat label="⏰ Faturas fechadas em aberto" value={late} tone={late > 0 ? 'neg' : undefined} hint={late > 0 ? 'Pague para liberar limite' : 'Nenhuma pendente'} />
      </div>

      <Section title="Limite por cartão" />
      {rows.map(({ card: c, b, spent, invoice }) => (
        <div key={c.id} className="card card-tile" role="button" onClick={() => navigate('cartoes/' + c.id)}>
          <div className="between">
            <div style={{ minWidth: 0 }}>
              <div className="bold">💳 {c.name}</div>
              <div className="tiny muted">{[c.bank, `fecha dia ${c.closingDay}`, `vence dia ${c.dueDay}`].filter(Boolean).join(' · ')}</div>
            </div>
            <span className={`badge ${usageTone(b.pct)}`}>{Math.round(b.pct * 100)}% usado</span>
          </div>
          <div style={{ margin: '12px 0 8px' }}>
            <Progress pct={b.pct} tone={usageTone(b.pct)} />
          </div>
          <div className="tri">
            <div>
              <small>Limite</small>
              <b><Money value={c.limit} /></b>
            </div>
            <div>
              <small>Usado</small>
              <b><Money value={b.used} /></b>
            </div>
            <div>
              <small>Disponível</small>
              <b className={b.available < 0 ? 'neg' : 'pos'}><Money value={b.available} /></b>
            </div>
          </div>
          <div className="divider" />
          <KV k={`Gasto em ${monthLabel(month, true).split('/')[0]}`} v={<Money value={spent} />} />
          <KV k={`Fatura que vence em ${monthLabel(month, true).split('/')[0]}`} v={<Money value={invoice} />} />
          <KV k={`Fatura atual (${monthLabel(b.openInvoice, true)})`} v={<Money value={b.current?.total ?? 0} />} />
          <div className="tiny muted" style={{ marginTop: 6 }}>
            Melhor dia de compra: dia {c.closingDay}
          </div>
        </div>
      ))}

      {spentAll.total > 0 && (
        <>
          <Section title={`Gasto por cartão em ${monthLabel(month, true).split('/')[0]}`} />
          <div className="card">
            <HBars items={rows.filter((r) => r.spent > 0).map((r) => ({ key: r.card.id, label: `💳 ${r.card.name}`, value: r.spent }))} />
          </div>
          <Section title="Gasto por categoria (todos os cartões)" />
          <div className="card">
            <HBars items={spentAll.byCategory.slice(0, 8).map((c) => ({ key: c.id, label: catName(c.id), value: c.value }))} />
          </div>
        </>
      )}

      <Section title="Faturas mês a mês" />
      <div className="card">
        <StackedBars data={stacked} series={series} initial={2} />
      </div>
    </div>
  )
}

export function CardDetail({ id }: { id: string }) {
  const data = useData()
  const card = data.cards.find((c) => c.id === id)
  const [sel, setSel] = useState<string | null>(null)
  if (!card)
    return (
      <div className="screen">
        <TopBar title="Cartão não encontrado" showBack />
      </div>
    )
  const b = limitBreakdown(data, card)
  const invoices = cardInvoices(data, card)
  const month = sel ?? b.openInvoice
  const inv = invoices.find((i) => i.month === month)
  const spentNow = cardSpending(data, monthKey(today()), card.id)
  const catName = (cid: string) => {
    const c = data.categories.find((x) => x.id === cid)
    return c ? `${c.icon} ${c.name}` : cid
  }
  const invByCat = new Map<string, number>()
  for (const t of inv?.items ?? []) invByCat.set(t.categoryId ?? 'outros-out', (invByCat.get(t.categoryId ?? 'outros-out') ?? 0) + t.amount)

  return (
    <div className="screen">
      <TopBar
        title={card.name}
        sub={[card.bank, `fecha dia ${card.closingDay}`, `vence dia ${card.dueDay}`].filter(Boolean).join(' · ')}
        showBack
        right={
          <button className="icon-btn" onClick={() => openForm({ type: 'cartao', id: card.id })} aria-label="Editar cartão e limite">
            ✏️
          </button>
        }
      />
      <div className="card">
        <div className="between small muted">
          <span>Disponível</span>
          <span>Limite {fmtBRL(card.limit)}</span>
        </div>
        <div className={`big-num ${b.available < 0 ? 'neg' : ''}`}>
          <Money value={b.available} />
        </div>
        <div style={{ margin: '10px 0 8px' }}>
          <Progress pct={b.pct} tone={usageTone(b.pct)} />
        </div>
        <div className="small muted">{Math.round(b.pct * 100)}% do limite usado</div>
        <div className="divider" />
        <KV k="Faturas fechadas em aberto" v={<Money value={b.closed} className={b.closed > 0 ? 'neg' : ''} />} />
        <KV k={`Fatura atual (${monthLabel(b.openInvoice, true)})`} v={<Money value={b.currentOpen} />} />
        <KV k="Parcelas futuras" v={<Money value={b.future} />} />
        <KV k="Total usado do limite" v={<Money value={b.used} />} total />
        <button className="btn secondary sm" style={{ marginTop: 10 }} onClick={() => openForm({ type: 'cartao', id: card.id })}>
          Alterar limite
        </button>
      </div>

      <div className="grid2" style={{ marginTop: 10 }}>
        <Stat label="Gasto este mês" value={spentNow.total} hint={`${new Set(spentNow.items.map((t) => t.source.id ?? t.id)).size} compra(s)`} />
        <div className="card stat">
          <div className="label">Melhor dia de compra</div>
          <div className="value">Dia {card.closingDay}</div>
          <div className="hint">A partir dele, as compras vão para a fatura seguinte</div>
        </div>
      </div>

      <Section title="Faturas" />
      <div className="chips">
        {invoices.map((i) => (
          <button key={i.month} className={`chip ${i.month === month ? 'on' : ''}`} onClick={() => setSel(i.month)}>
            {monthLabel(i.month, true)} {i.paid ? '✓' : ''}
          </button>
        ))}
        {!invoices.length && <span className="small muted">Sem faturas ainda</span>}
      </div>
      {inv ? (
        <>
          <div className="card">
            <div className="between">
              <div>
                <div className="tiny muted">
                  {month === b.openInvoice ? 'Fatura atual (aberta)' : month < b.openInvoice ? 'Fatura fechada' : 'Próxima fatura'} · fecha{' '}
                  {fmtDate(invoiceClosingDate(card, month))}
                </div>
                <div className="big-num">
                  <Money value={inv.total} />
                </div>
                <div className="tiny muted">Vence {fmtDate(inv.dueDate)}</div>
              </div>
              {inv.paid ? (
                <button className="btn sm secondary" onClick={() => actions.payInvoice(card.id, month, undefined, false)}>
                  ✓ Paga
                </button>
              ) : (
                <button
                  className="btn sm"
                  onClick={() => {
                    actions.payInvoice(card.id, month, card.accountId)
                    toast('Fatura paga — limite liberado')
                  }}
                >
                  Pagar fatura
                </button>
              )}
            </div>
          </div>
          {invByCat.size > 1 && (
            <div className="card">
              <h3>Por categoria</h3>
              <HBars items={[...invByCat.entries()].sort((a, c) => c[1] - a[1]).map(([k, v]) => ({ key: k, label: catName(k), value: round2(v) }))} />
            </div>
          )}
          <div className="card tight">
            {inv.items.map((t) => (
              <TxRow key={t.id} t={t} />
            ))}
          </div>
        </>
      ) : (
        <div className="card small muted center">Nenhum lançamento nesta fatura.</div>
      )}

      {b.next.length > 0 && (
        <>
          <Section title="Próximas faturas" />
          <div className="card">
            {b.next.slice(0, 12).map((i) => (
              <KV key={i.month} k={monthLabel(i.month)} v={fmtBRL(i.total)} />
            ))}
          </div>
        </>
      )}

      {b.installmentsActive.length > 0 && (
        <>
          <Section title="Compras parceladas" />
          <div className="card tight">
            {b.installmentsActive.map((p) => {
              const paidN = data.transactions.filter((t) => t.source.type === 'purchase' && t.source.id === p.id && t.paid).length
              return (
                <div key={p.id} className="list-item" role="button" onClick={() => openForm({ type: 'compra', id: p.id })}>
                  <div className="ic">🛍️</div>
                  <div className="main">
                    <div className="title">{[p.platform, p.product].filter(Boolean).join(' — ')}</div>
                    <div className="meta">
                      {paidN}/{p.installments} pagas · {fmtDateShort(p.date)}
                    </div>
                  </div>
                  <div className="end">
                    <div className="amount">
                      {p.installments}x <Money value={splitInstallments(p.total, p.installments)[1]} />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
