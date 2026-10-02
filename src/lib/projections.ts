// Saldos, totais por período, previsão dos próximos meses, alertas e análise financeira.
import {
  addDays,
  addMonthKey,
  diffDays,
  endOfMonth,
  monthKey,
  startOfMonth,
  startOfWeek,
  today,
  type ISODate,
} from './dates'
import { round2, sum } from './money'
import { invoiceDueDate, openInvoice } from './generate'
import { monthsToGoal, summarizeFinancing } from './finance'
import type { AppData, Card, Goal, Transaction } from './types'

// ---------------------------------------------------------------------------
// Saldo
// ---------------------------------------------------------------------------

export function defaultAccountId(data: AppData): string | undefined {
  return data.accounts.find((a) => !a.archived)?.id ?? data.accounts[0]?.id
}

/** Efeito de um lançamento PAGO no saldo de uma conta. */
function effectOn(t: Transaction, accountId: string, fallback: string | undefined): number {
  const acc = t.accountId ?? fallback
  if (t.kind === 'in') return acc === accountId ? t.amount : 0
  if (t.kind === 'out') return acc === accountId ? -t.amount : 0
  let v = 0
  if (acc === accountId) v -= t.amount
  if (t.toAccountId === accountId) v += t.amount
  return v
}

export function accountBalance(data: AppData, accountId: string, until?: ISODate): number {
  const acc = data.accounts.find((a) => a.id === accountId)
  if (!acc) return 0
  const fb = defaultAccountId(data)
  let b = acc.initialBalance
  for (const t of data.transactions) {
    if (!t.paid || t.date < acc.balanceDate) continue
    if (until && t.date > until) continue
    b += effectOn(t, accountId, fb)
  }
  return round2(b)
}

export function currentBalance(data: AppData): number {
  return sum(data.accounts.filter((a) => !a.archived).map((a) => accountBalance(data, a.id)))
}

/** Saldo real (pagos) ao final de uma data passada. */
export function balanceAt(data: AppData, date: ISODate): number {
  return sum(
    data.accounts
      .filter((a) => !a.archived && a.balanceDate <= date)
      .map((a) => accountBalance(data, a.id, date)),
  )
}

/** Saldo projetado: saldo atual + pendentes até a data (inclui atrasados). */
export function projectedBalance(data: AppData, until: ISODate): number {
  let b = currentBalance(data)
  for (const t of data.transactions) {
    if (t.paid || t.date > until) continue
    if (t.kind === 'in') b += t.amount
    else if (t.kind === 'out') b -= t.amount
  }
  return round2(b)
}

// ---------------------------------------------------------------------------
// Períodos
// ---------------------------------------------------------------------------

export type PeriodKind = 'hoje' | 'semana' | 'mes' | 'proximo' | 'personalizado'
export interface Period {
  kind: PeriodKind
  start: ISODate
  end: ISODate
}

export function makePeriod(kind: PeriodKind, ref: ISODate = today(), custom?: { start: ISODate; end: ISODate }): Period {
  switch (kind) {
    case 'hoje':
      return { kind, start: ref, end: ref }
    case 'semana': {
      const s = startOfWeek(ref)
      return { kind, start: s, end: addDays(s, 6) }
    }
    case 'proximo': {
      const s = startOfMonth(addMonthKey(monthKey(ref), 1) + '-01')
      return { kind, start: s, end: endOfMonth(s) }
    }
    case 'personalizado':
      return { kind, start: custom?.start ?? startOfMonth(ref), end: custom?.end ?? endOfMonth(ref) }
    default:
      return { kind: 'mes', start: startOfMonth(ref), end: endOfMonth(ref) }
  }
}

export const inPeriod = (t: Transaction, p: { start: ISODate; end: ISODate }) => t.date >= p.start && t.date <= p.end

export function isInstallment(t: Transaction): boolean {
  return (
    t.kind === 'out' &&
    (t.source.type === 'debt' || t.source.type === 'financing' || (t.installment != null && t.installment.total > 1))
  )
}

export interface PeriodStats {
  income: number
  incomeReceived: number
  expenses: number
  installments: number
  toPay: number
  paid: number
  byCategory: { id: string; value: number }[]
  byMethod: { id: string; value: number }[]
}

export function periodStats(data: AppData, p: { start: ISODate; end: ISODate }): PeriodStats {
  const txs = data.transactions.filter((t) => inPeriod(t, p))
  const ins = txs.filter((t) => t.kind === 'in')
  const outs = txs.filter((t) => t.kind === 'out')
  const group = (key: (t: Transaction) => string) => {
    const m = new Map<string, number>()
    for (const t of outs) m.set(key(t), (m.get(key(t)) ?? 0) + t.amount)
    return [...m.entries()].map(([id, value]) => ({ id, value: round2(value) })).sort((a, b) => b.value - a.value)
  }
  return {
    income: sum(ins.map((t) => t.amount)),
    incomeReceived: sum(ins.filter((t) => t.paid).map((t) => t.amount)),
    expenses: sum(outs.map((t) => t.amount)),
    installments: sum(outs.filter(isInstallment).map((t) => t.amount)),
    toPay: sum(outs.filter((t) => !t.paid).map((t) => t.amount)),
    paid: sum(outs.filter((t) => t.paid).map((t) => t.amount)),
    byCategory: group((t) => t.categoryId ?? 'outros-out'),
    byMethod: group((t) => (t.cardId ? 'Crédito' : (t.method ?? 'Outros'))),
  }
}

// ---------------------------------------------------------------------------
// Próximos meses
// ---------------------------------------------------------------------------

export interface MonthForecast {
  month: string // AAAA-MM
  income: number
  expenses: number // despesas comuns (não parceladas)
  purchases: number // compras parceladas / cartão parcelado
  debts: number
  financings: number
  totalOut: number
  installmentsTotal: number // purchases + debts + financings
  balance: number // saldo projetado ao fim do mês
  commitment: number // % da renda comprometida com parcelas
}

export function forecast(data: AppData, months = 12, ref: ISODate = today()): MonthForecast[] {
  const out: MonthForecast[] = []
  const first = monthKey(ref)
  for (let i = 0; i < months; i++) {
    const m = addMonthKey(first, i)
    const txs = data.transactions.filter((t) => monthKey(t.date) === m)
    let income = 0,
      expenses = 0,
      purchases = 0,
      debts = 0,
      financings = 0
    for (const t of txs) {
      if (t.kind === 'in') income += t.amount
      else if (t.kind === 'out') {
        if (t.source.type === 'financing') financings += t.amount
        else if (t.source.type === 'debt') debts += t.amount
        else if (t.installment && t.installment.total > 1) purchases += t.amount
        else expenses += t.amount
      }
    }
    const installmentsTotal = purchases + debts + financings
    out.push({
      month: m,
      income: round2(income),
      expenses: round2(expenses),
      purchases: round2(purchases),
      debts: round2(debts),
      financings: round2(financings),
      totalOut: round2(expenses + installmentsTotal),
      installmentsTotal: round2(installmentsTotal),
      balance: projectedBalance(data, endOfMonth(m + '-01')),
      commitment: income > 0 ? installmentsTotal / income : 0,
    })
  }
  return out
}

/** Série de saldo: meses passados (real) e futuros (projetado). */
export function balanceSeries(data: AppData, past = 5, future = 6, ref: ISODate = today()) {
  const cur = monthKey(ref)
  const series: { month: string; value: number; projected: boolean }[] = []
  for (let i = -past; i <= future; i++) {
    const m = addMonthKey(cur, i)
    const end = endOfMonth(m + '-01')
    if (i < 0) {
      // sem histórico antes da data do saldo inicial das contas
      if (!data.accounts.some((a) => !a.archived && a.balanceDate <= end)) continue
      series.push({ month: m, value: balanceAt(data, end), projected: false })
    } else series.push({ month: m, value: projectedBalance(data, end), projected: true })
  }
  return series
}

export function incomeVsExpenses(data: AppData, from: string, count: number) {
  return Array.from({ length: count }, (_, i) => {
    const m = addMonthKey(from, i)
    const s = periodStats(data, { start: m + '-01', end: endOfMonth(m + '-01') })
    return { month: m, income: s.income, expenses: s.expenses }
  })
}

// ---------------------------------------------------------------------------
// Cartões e faturas
// ---------------------------------------------------------------------------

export interface Invoice {
  cardId: string
  month: string
  dueDate: ISODate
  total: number
  paidTotal: number
  paid: boolean
  items: Transaction[]
}

export function cardInvoices(data: AppData, card: Card): Invoice[] {
  const m = new Map<string, Transaction[]>()
  for (const t of data.transactions) {
    if (t.cardId !== card.id || !t.invoice) continue
    if (!m.has(t.invoice)) m.set(t.invoice, [])
    m.get(t.invoice)!.push(t)
  }
  return [...m.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, items]) => ({
      cardId: card.id,
      month,
      dueDate: invoiceDueDate(card, month),
      total: sum(items.map((t) => t.amount)),
      paidTotal: sum(items.filter((t) => t.paid).map((t) => t.amount)),
      paid: items.every((t) => t.paid),
      items: items.sort((a, b) => (a.purchaseDate ?? a.date).localeCompare(b.purchaseDate ?? b.date)),
    }))
}

export function cardUsage(data: AppData, card: Card, ref: ISODate = today()) {
  const open = openInvoice(card, ref)
  const used = sum(
    data.transactions
      .filter(
        (t) =>
          t.cardId === card.id &&
          !t.paid &&
          // recorrências futuras ainda não consomem limite
          (t.source.type !== 'recurring' || (t.invoice ?? '') <= open),
      )
      .map((t) => t.amount),
  )
  const invoices = cardInvoices(data, card)
  const current = invoices.find((i) => i.month === open)
  return {
    used,
    available: round2(card.limit - used),
    pct: card.limit > 0 ? used / card.limit : 0,
    openInvoice: open,
    current,
    next: invoices.filter((i) => i.month > open),
    previous: invoices.filter((i) => i.month < open),
    installmentsActive: data.purchases.filter(
      (p) => p.cardId === card.id && p.installments > 1 && p.status !== 'cancelado' && p.status !== 'devolvido',
    ),
  }
}

// ---------------------------------------------------------------------------
// Metas e reserva
// ---------------------------------------------------------------------------

export function goalSaved(g: Goal): number {
  return round2(g.initial + g.entries.reduce((a, e) => a + e.amount, 0))
}

export function goalProgress(g: Goal, ref: ISODate = today()) {
  const saved = goalSaved(g)
  const remaining = Math.max(0, round2(g.target - saved))
  const pct = g.target > 0 ? Math.min(1, saved / g.target) : 0
  const months = g.monthly ? monthsToGoal(remaining, g.monthly) : Infinity
  const eta = Number.isFinite(months) ? addMonthKey(monthKey(ref), months) : null
  let neededMonthly: number | null = null
  if (g.targetDate && remaining > 0) {
    const mLeft = Math.max(1, Math.ceil(diffDays(ref, g.targetDate) / 30.4375))
    neededMonthly = round2(remaining / mLeft)
  }
  return { saved, remaining, pct, months, eta, neededMonthly }
}

export function reserveValue(data: AppData): number {
  return round2(data.reserve.entries.reduce((a, e) => a + e.amount, 0))
}

/** Média de despesas mensais (meses com dados entre os últimos 3 completos; senão, o mês atual previsto). */
export function averageMonthly(data: AppData, ref: ISODate = today()) {
  const cur = monthKey(ref)
  const months: { income: number; expenses: number }[] = []
  for (let i = 1; i <= 3; i++) {
    const m = addMonthKey(cur, -i)
    const s = periodStats(data, { start: m + '-01', end: endOfMonth(m + '-01') })
    if (s.income > 0 || s.expenses > 0) months.push({ income: s.income, expenses: s.expenses })
  }
  if (!months.length) {
    const s = periodStats(data, { start: cur + '-01', end: endOfMonth(cur + '-01') })
    months.push({ income: s.income, expenses: s.expenses })
  }
  const income = round2(months.reduce((a, b) => a + b.income, 0) / months.length)
  const expenses = round2(months.reduce((a, b) => a + b.expenses, 0) / months.length)
  return { income, expenses, leftover: round2(income - expenses), basis: months.length }
}

// ---------------------------------------------------------------------------
// Alertas
// ---------------------------------------------------------------------------

export interface Alert {
  id: string
  level: 'danger' | 'warning' | 'info' | 'success'
  icon: string
  title: string
  detail: string
  date?: ISODate
  link?: string
}

export function computeAlerts(data: AppData, ref: ISODate = today()): Alert[] {
  const a = data.settings.alerts
  const alerts: Alert[] = []
  const limit = addDays(ref, a.daysBefore)
  const fmt = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  const pendingOut = data.transactions.filter((t) => t.kind === 'out' && !t.paid && !t.cardId)
  if (a.overdue) {
    for (const t of pendingOut.filter((t) => t.date < ref)) {
      alerts.push({
        id: 'late-' + t.id,
        level: 'danger',
        icon: '⏰',
        title: `${t.installment ? 'Parcela atrasada' : 'Conta atrasada'}: ${t.description}`,
        detail: `${fmt(t.amount)} — venceu há ${diffDays(t.date, ref)} dia(s)`,
        date: t.date,
        link: 'compromissos',
      })
    }
  }
  for (const t of pendingOut.filter((t) => t.date >= ref && t.date <= limit)) {
    const isInst = t.installment != null
    if (isInst ? !a.installments : !a.bills) continue
    const d = diffDays(ref, t.date)
    alerts.push({
      id: 'due-' + t.id,
      level: d === 0 ? 'warning' : 'info',
      icon: isInst ? '📆' : '🧾',
      title: `${isInst ? 'Parcela' : 'Conta'} ${d === 0 ? 'vence hoje' : `vence em ${d} dia(s)`}: ${t.description}`,
      detail: fmt(t.amount),
      date: t.date,
      link: 'compromissos',
    })
  }
  for (const card of data.cards) {
    const u = cardUsage(data, card, ref)
    if (a.invoices) {
      const invs = cardInvoices(data, card).filter((i) => !i.paid && i.dueDate <= limit)
      for (const inv of invs) {
        const d = diffDays(ref, inv.dueDate)
        alerts.push({
          id: `inv-${card.id}-${inv.month}`,
          level: d < 0 ? 'danger' : 'warning',
          icon: '💳',
          title: d < 0 ? `Fatura ${card.name} atrasada` : `Fatura ${card.name} vence ${d === 0 ? 'hoje' : `em ${d} dia(s)`}`,
          detail: fmt(round2(inv.total - inv.paidTotal)),
          date: inv.dueDate,
          link: 'cartoes',
        })
      }
    }
    if (a.cardLimit && card.limit > 0 && u.pct >= a.cardLimitPct) {
      alerts.push({
        id: 'lim-' + card.id,
        level: u.pct >= 1 ? 'danger' : 'warning',
        icon: '⚠️',
        title: `Limite do ${card.name} em ${Math.round(u.pct * 100)}%`,
        detail: `Disponível: ${fmt(u.available)}`,
        link: 'cartoes',
      })
    }
  }
  if (a.goals) {
    for (const g of data.goals) {
      const p = goalProgress(g, ref)
      if (p.pct >= 0.9 && p.pct < 1)
        alerts.push({ id: 'goal-' + g.id, level: 'success', icon: '🎯', title: `Meta quase lá: ${g.name}`, detail: `Faltam ${fmt(p.remaining)}`, link: 'metas' })
      else if (p.pct >= 1)
        alerts.push({ id: 'goalok-' + g.id, level: 'success', icon: '🏆', title: `Meta atingida: ${g.name}`, detail: 'Parabéns!', link: 'metas' })
    }
  }
  if (a.negativeBalance) {
    const neg = forecast(data, 12, ref).find((m) => m.balance < 0)
    if (neg)
      alerts.push({
        id: 'neg-' + neg.month,
        level: 'danger',
        icon: '📉',
        title: 'Saldo projetado negativo',
        detail: `Em ${neg.month.slice(5)}/${neg.month.slice(0, 4)}: ${fmt(neg.balance)}`,
        link: 'planejamento',
      })
  }
  if (a.financingEnd) {
    for (const f of data.financings) {
      const paid = data.transactions.filter((t) => t.source.type === 'financing' && t.source.id === f.id && t.paid).length
      const s = summarizeFinancing({ ...f, paidCount: paid })
      if (s.remainingCount > 0 && s.remainingCount <= 3)
        alerts.push({
          id: 'fin-' + f.id,
          level: 'success',
          icon: '🏁',
          title: `${f.name} está acabando`,
          detail: `Faltam ${s.remainingCount} parcela(s)`,
          link: 'financiamentos',
        })
    }
  }
  const order = { danger: 0, warning: 1, info: 2, success: 3 }
  return alerts.sort((x, y) => order[x.level] - order[y.level] || (x.date ?? '').localeCompare(y.date ?? ''))
}

// ---------------------------------------------------------------------------
// Compromissos (dívidas, contas) por situação
// ---------------------------------------------------------------------------

export function bucketOf(t: Transaction, ref: ISODate = today()) {
  if (t.paid) return 'pagas'
  if (t.date < ref) return 'vencidas'
  if (t.date === ref) return 'hoje'
  const d = diffDays(ref, t.date)
  if (d <= 7) return '7dias'
  if (d <= 30) return '30dias'
  return 'futuras'
}
