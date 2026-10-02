// Plano para quitar dívidas (protestos, nome negativado, contas atrasadas, acordos).
//
// Dívidas SEM acordo recebem o valor que você consegue separar por mês, uma de cada vez,
// na ordem da estratégia escolhida. Quando existe proposta à vista (desconto), o dinheiro é
// juntado até alcançar a proposta e a dívida é quitada de uma vez. Sem proposta, o valor do
// mês abate o saldo (que cresce pelos juros informados).
// Dívidas JÁ em acordo seguem as próprias parcelas; quando terminam, a parcela pode ser somada
// ao valor mensal ("bola de neve").
import { addMonthKey, monthDiff, monthKey, today, type ISODate } from './dates'
import { round2 } from './money'
import type { Debt, DebtKind, Transaction } from './types'

export type Strategy = 'caras' | 'menores' | 'protestos'

export interface PlanStep {
  id: string
  name: string
  creditor: string
  kind: DebtKind
  balance: number // devido hoje
  target: number // o que será pago (proposta ou saldo)
  interest: number
  hasOffer: boolean
  paidMonth: string | null // AAAA-MM em que fica quitada
  paid: number // total efetivamente pago
  saved: number // desconto da proposta
}

export interface ScheduledDebt {
  id: string
  name: string
  creditor: string
  kind: DebtKind
  installment: number
  remaining: number // parcelas em aberto
  remainingValue: number
  endMonth: string | null
}

export interface PayoffPlan {
  steps: PlanStep[]
  scheduled: ScheduledDebt[]
  debtFreeMonth: string | null
  months: number
  totalOpen: number // devido hoje nas dívidas sem acordo
  totalToPay: number
  totalSaved: number
  neverEnds: boolean
}

const KIND_ORDER: Record<DebtKind, number> = { protesto: 0, negativado: 1, atrasada: 2, cartao: 3, emprestimo: 4, acordo: 5, outra: 6 }

export const debtKind = (d: Debt): DebtKind => d.kind ?? (d.recurring ? 'acordo' : 'outra')
export const isOpen = (d: Debt) => d.status !== 'quitada' && d.scheduled === false
export const debtBalance = (d: Debt) => d.balance ?? d.amount

export function planPayoff(
  debts: Debt[],
  txs: Transaction[],
  budget: number,
  strategy: Strategy,
  opts: { rollover?: boolean; ref?: ISODate } = {},
): PayoffPlan {
  const ref = opts.ref ?? today()
  const start = monthKey(ref)
  const rollover = opts.rollover ?? true

  // dívidas já em acordo / programadas
  const scheduled: ScheduledDebt[] = debts
    .filter((d) => d.status !== 'quitada' && d.scheduled !== false)
    .map((d) => {
      const open = txs.filter((t) => t.source.type === 'debt' && t.source.id === d.id && !t.paid).sort((a, b) => a.date.localeCompare(b.date))
      return {
        id: d.id,
        name: d.name,
        creditor: d.creditor,
        kind: debtKind(d),
        // acordo com datas livres não libera um valor mensal fixo quando termina
        installment: d.customSchedule?.length ? 0 : d.amount,
        remaining: open.length,
        remainingValue: round2(open.reduce((a, t) => a + t.amount, 0)),
        endMonth: open.length ? monthKey(open[open.length - 1].date) : null,
      }
    })
    .filter((s) => s.remaining > 0)

  // dívidas sem acordo, na ordem da estratégia
  const items = debts.filter(isOpen).map((d) => ({
    d,
    balance: debtBalance(d),
    target: d.offer && d.offer > 0 ? Math.min(d.offer, debtBalance(d)) : debtBalance(d),
    hasOffer: !!(d.offer && d.offer > 0 && d.offer < debtBalance(d)),
    rate: d.interest ?? 0,
  }))
  items.sort((a, b) => {
    if (strategy === 'caras') return b.rate - a.rate || a.target - b.target
    if (strategy === 'protestos') return KIND_ORDER[debtKind(a.d)] - KIND_ORDER[debtKind(b.d)] || a.target - b.target
    return a.target - b.target
  })

  const steps: PlanStep[] = items.map((x) => ({
    id: x.d.id,
    name: x.d.name,
    creditor: x.d.creditor,
    kind: debtKind(x.d),
    balance: round2(x.balance),
    target: round2(x.target),
    interest: x.rate,
    hasOffer: x.hasOffer,
    paidMonth: null,
    paid: 0,
    saved: x.hasOffer ? round2(x.balance - x.target) : 0,
  }))
  // saldos que correm juros (sem proposta)
  const remaining = items.map((x) => (x.hasOffer ? x.target : x.balance))

  let fund = 0
  let i = 0
  let m = 0
  const MAX = 360
  while (i < items.length && m < MAX) {
    const month = addMonthKey(start, m)
    let available = budget
    if (rollover) for (const s of scheduled) if (s.endMonth && month > s.endMonth) available += s.installment
    fund += available
    // juros do mês nas dívidas sem proposta ainda não quitadas
    for (let k = i; k < items.length; k++) if (!items[k].hasOffer && items[k].rate > 0) remaining[k] *= 1 + items[k].rate
    while (i < items.length) {
      if (items[i].hasOffer) {
        if (fund + 1e-9 < remaining[i]) break // juntando para pagar a proposta à vista
        fund -= remaining[i]
        steps[i].paid = round2(remaining[i])
        steps[i].paidMonth = month
        i++
      } else {
        const pay = Math.min(fund, remaining[i])
        remaining[i] -= pay
        steps[i].paid = round2(steps[i].paid + pay)
        fund -= pay
        if (remaining[i] > 0.005) break
        steps[i].paidMonth = month
        i++
      }
    }
    m++
    if (budget <= 0 && !rollover) break
  }

  const neverEnds = i < items.length
  const endMonths = [...steps.map((s) => s.paidMonth), ...scheduled.map((s) => s.endMonth)].filter((x): x is string => !!x)
  const debtFreeMonth = neverEnds ? null : endMonths.sort().at(-1) ?? null
  return {
    steps,
    scheduled,
    debtFreeMonth,
    months: debtFreeMonth ? monthDiff(start, debtFreeMonth) + 1 : 0,
    totalOpen: round2(items.reduce((a, x) => a + x.balance, 0)),
    totalToPay: round2(steps.reduce((a, s) => a + (s.paidMonth ? s.paid : s.target), 0)),
    totalSaved: round2(steps.reduce((a, s) => a + s.saved, 0)),
    neverEnds,
  }
}
