// Geração automática de lançamentos futuros a partir de compras parceladas, cartões,
// dívidas, financiamentos e contas recorrentes.
import { addDays, addMonths, addMonthKey, endOfMonth, makeDate, today, ymd, type ISODate } from './dates'
import { splitInstallments } from './money'
import { summarizeFinancing } from './finance'
import { uid } from './defaults'
import type {
  AppData,
  Card,
  Debt,
  Financing,
  Frequency,
  Purchase,
  Recurrence,
  SourceType,
  Transaction,
} from './types'

/** Horizonte de geração automática: fim do 12º mês a partir de hoje. */
export function horizon(ref: ISODate = today()): ISODate {
  return endOfMonth(addMonths(ref, 12))
}

// ---------------------------------------------------------------------------
// Cartão de crédito
// ---------------------------------------------------------------------------

/**
 * Fatura em que cai uma compra feita em `date`.
 * Compras feitas a partir do dia de fechamento entram na fatura seguinte.
 * Retorna o mês de VENCIMENTO da fatura ("AAAA-MM").
 */
export function invoiceFor(card: Pick<Card, 'closingDay' | 'dueDay'>, date: ISODate): string {
  const [y, m, d] = ymd(date)
  const closeMonthOffset = d >= card.closingDay ? 1 : 0
  const dueOffset = card.dueDay > card.closingDay ? 0 : 1
  return makeDate(y, m + closeMonthOffset + dueOffset, 1).slice(0, 7)
}

export function invoiceDueDate(card: Pick<Card, 'dueDay'>, invoice: string): ISODate {
  return makeDate(Number(invoice.slice(0, 4)), Number(invoice.slice(5, 7)), card.dueDay)
}

export function invoiceClosingDate(card: Pick<Card, 'closingDay' | 'dueDay'>, invoice: string): ISODate {
  const y = Number(invoice.slice(0, 4))
  const m = Number(invoice.slice(5, 7))
  return card.dueDay > card.closingDay ? makeDate(y, m, card.closingDay) : makeDate(y, m - 1, card.closingDay)
}

/** Fatura atualmente "aberta" (recebendo compras) do cartão. */
export function openInvoice(card: Card, ref: ISODate = today()): string {
  return invoiceFor(card, ref)
}

// ---------------------------------------------------------------------------
// Construção dos lançamentos de cada origem
// ---------------------------------------------------------------------------

type Draft = Omit<Transaction, 'id' | 'createdAt' | 'paid'> & { paid?: boolean }

export function purchaseDrafts(p: Purchase, cards: Card[]): Draft[] {
  if (p.status === 'cancelado' || p.status === 'devolvido') return []
  const n = Math.max(1, Math.round(p.installments))
  const values = splitInstallments(p.total, n)
  const card = p.cardId ? cards.find((c) => c.id === p.cardId) : undefined
  const label = [p.platform, p.product].filter(Boolean).join(' — ')
  const base = {
    kind: 'out' as const,
    description: label || 'Compra',
    categoryId: p.categoryId ?? 'compras',
    subcategory: p.subcategory,
    method: p.method,
    accountId: p.accountId,
    note: p.note,
    source: { type: 'purchase' as SourceType, id: p.id },
    purchaseDate: p.date,
  }
  if (card) {
    const first = invoiceFor(card, p.date)
    return values.map((amount, i) => {
      const inv = addMonthKey(first, i)
      return {
        ...base,
        amount,
        cardId: card.id,
        accountId: card.accountId ?? p.accountId,
        invoice: inv,
        date: invoiceDueDate(card, inv),
        installment: n > 1 ? { n: i + 1, total: n } : undefined,
        key: `p${i + 1}`,
      }
    })
  }
  const first = p.firstDate ?? p.date
  const anchor = Number(first.slice(8, 10))
  return values.map((amount, i) => ({
    ...base,
    amount,
    date: addMonths(first, i, anchor),
    installment: n > 1 ? { n: i + 1, total: n } : undefined,
    key: `p${i + 1}`,
  }))
}

export function debtDrafts(d: Debt, until: ISODate): Draft[] {
  if (d.scheduled === false) return [] // sem acordo ainda: fica só no plano de pagamento
  const description = `${d.name}${d.creditor ? ` (${d.creditor})` : ''}`
  if (d.customSchedule?.length) {
    // acordo com datas e valores escolhidos (não mensal)
    const rows = [...d.customSchedule].filter((r) => r.amount > 0 && r.date).sort((a, b) => a.date.localeCompare(b.date))
    return rows.map((r, i) => ({
      kind: 'out' as const,
      amount: r.amount,
      date: r.date,
      description,
      categoryId: d.categoryId ?? 'dividas',
      accountId: d.accountId,
      method: 'Boleto',
      installment: rows.length > 1 ? { n: i + 1, total: rows.length } : undefined,
      source: { type: 'debt' as SourceType, id: d.id },
      key: `p${i + 1}`,
      paid: i < d.paidCount || d.status === 'quitada',
    }))
  }
  const anchor = Number(d.firstDue.slice(8, 10))
  const total = d.recurring ? d.installments : 1
  const out: Draft[] = []
  for (let i = 0; ; i++) {
    if (total > 0 && i >= total) break
    const date = addMonths(d.firstDue, i, anchor)
    if (total === 0 && date > until) break // recorrente sem fim: até o horizonte
    out.push({
      kind: 'out',
      amount: d.amount,
      date,
      description,
      categoryId: d.categoryId ?? 'dividas',
      accountId: d.accountId,
      method: 'Boleto',
      installment: total > 1 ? { n: i + 1, total } : undefined,
      source: { type: 'debt', id: d.id },
      key: `p${i + 1}`,
      paid: i < d.paidCount || d.status === 'quitada',
    })
  }
  return out
}

export function financingDrafts(f: Financing): Draft[] {
  const s = summarizeFinancing(f)
  return s.schedule.map((row) => ({
    kind: 'out' as const,
    amount: row.payment,
    date: row.date,
    description: `Financiamento ${f.name}`,
    categoryId: 'financiamentos',
    accountId: f.accountId,
    method: 'Boleto',
    installment: { n: row.k, total: s.resolved.n },
    source: { type: 'financing' as SourceType, id: f.id },
    key: `p${row.k}`,
    paid: row.k <= f.paidCount,
  }))
}

const MONTH_STEP: Partial<Record<Frequency, number>> = {
  mensal: 1,
  bimestral: 2,
  trimestral: 3,
  semestral: 6,
  anual: 12,
}

export function recurrenceDates(r: Recurrence, until: ISODate): ISODate[] {
  const end = r.end && r.end < until ? r.end : until
  const dates: ISODate[] = []
  const step = MONTH_STEP[r.frequency]
  if (step) {
    const [y, m] = ymd(r.start)
    let date = makeDate(y, m, r.day)
    if (date < r.start) date = makeDate(y, m + 1, r.day)
    let i = 0
    const [y0, m0] = ymd(date)
    while (date <= end && i < 1000) {
      dates.push(date)
      i++
      date = makeDate(y0, m0 + i * step, r.day)
    }
  } else {
    const days = r.frequency === 'semanal' ? 7 : 14
    let date = r.start
    while (date <= end && dates.length < 1000) {
      dates.push(date)
      date = addDays(date, days)
    }
  }
  return dates
}

export function recurrenceDrafts(r: Recurrence, cards: Card[], until: ISODate): Draft[] {
  if (!r.active) return []
  const card = r.cardId ? cards.find((c) => c.id === r.cardId) : undefined
  return recurrenceDates(r, until).map((date) => {
    const d: Draft = {
      kind: r.kind,
      amount: r.amount,
      date,
      description: r.description,
      categoryId: r.categoryId,
      origin: r.origin,
      method: r.method,
      accountId: r.accountId,
      note: r.note,
      source: { type: 'recurring', id: r.id },
      key: date,
    }
    if (card && r.kind === 'out') {
      const inv = invoiceFor(card, date)
      d.cardId = card.id
      d.invoice = inv
      d.purchaseDate = date
      d.date = invoiceDueDate(card, inv)
      d.accountId = card.accountId ?? r.accountId
    }
    return d
  })
}

// ---------------------------------------------------------------------------
// Mesclagem: preserva status de pagamento e edições manuais
// ---------------------------------------------------------------------------

/**
 * Substitui os lançamentos de uma origem pelos novos rascunhos, preservando
 * o status "pago" e valores editados manualmente quando a chave coincide.
 * Lançamentos novos com data anterior a hoje entram como pagos se `pastAsPaid`.
 */
export function mergeSource(
  txs: Transaction[],
  type: SourceType,
  id: string,
  drafts: Draft[],
  opts: { pastAsPaid?: boolean; respectDraftPaid?: boolean } = {},
): Transaction[] {
  const old = new Map<string, Transaction>()
  const others: Transaction[] = []
  for (const t of txs) {
    if (t.source.type === type && t.source.id === id) old.set(t.key ?? t.id, t)
    else others.push(t)
  }
  const now = Date.now()
  const t0 = today()
  const fresh = drafts.map((d) => {
    const prev = d.key ? old.get(d.key) : undefined
    let paid: boolean
    if (opts.respectDraftPaid && d.paid != null) paid = d.paid
    else if (prev) paid = prev.paid
    else paid = d.paid ?? (opts.pastAsPaid ? d.date < t0 : false)
    const tx: Transaction = {
      ...d,
      id: prev?.id ?? uid(),
      createdAt: prev?.createdAt ?? now,
      paid,
    }
    if (prev?.edited) {
      tx.amount = prev.amount
      tx.edited = true
    }
    if (prev?.paid && prev.accountId) tx.accountId = prev.accountId
    return tx
  })
  return [...others, ...fresh]
}

export function removeSource(txs: Transaction[], type: SourceType, id: string): Transaction[] {
  return txs.filter((t) => !(t.source.type === type && t.source.id === id))
}

/** Regera os lançamentos de todas as origens automáticas (ao abrir o app e após alterações). */
export function regenerateAll(data: AppData, ref: ISODate = today()): AppData {
  const until = horizon(ref)
  let txs = data.transactions
  for (const p of data.purchases) txs = mergeSource(txs, 'purchase', p.id, purchaseDrafts(p, data.cards), { pastAsPaid: true })
  for (const d of data.debts) txs = mergeSource(txs, 'debt', d.id, debtDrafts(d, until), { respectDraftPaid: false })
  for (const f of data.financings) txs = mergeSource(txs, 'financing', f.id, financingDrafts(f))
  for (const r of data.recurrences) txs = mergeSource(txs, 'recurring', r.id, recurrenceDrafts(r, data.cards, until), { pastAsPaid: true })
  return { ...data, transactions: txs, generatedUntil: until }
}

/** Para dívidas e financiamentos, o número de parcelas pagas acompanha os lançamentos marcados como pagos. */
export function paidCountFromTxs(txs: Transaction[], type: SourceType, id: string): number {
  return txs.filter((t) => t.source.type === type && t.source.id === id && t.paid).length
}
