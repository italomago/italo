// Comparação entre financiamentos: onde um valor disponível rende mais se usado para amortizar.
//
// Amortizar uma dívida "rende" exatamente o custo dela: cada real abatido deixa de pagar
// a taxa do contrato (mais a correção do saldo, quando houver IPCA/TR). Por isso o ranking
// é feito pelo custo efetivo mensal, e não pela economia total em reais — um contrato longo
// mostra economia nominal maior, mas ela acontece muitos anos à frente.
import { anticipateLast, extraordinaryPayment, loanStateFrom, monthlyToAnnual, summarizeFinancing } from './finance'
import { round2 } from './money'
import type { ISODate } from './dates'
import type { Financing } from './types'

export interface AmortOption {
  id: string
  name: string
  type: Financing['type']
  institution: string
  balance: number
  remaining: number
  /** Custo efetivo ao mês (juros + correção do saldo). */
  monthlyCost: number
  annualCost: number
  indexMonthly: number
  currentPayment: number
  endDate: ISODate | null
  // Opção 1: reduzir prazo
  monthsSaved: number
  interestSavedTerm: number
  newEndDate: ISODate | null
  // Opção 2: reduzir parcela
  newPayment: number
  monthlyRelief: number
  interestSavedPayment: number
  // Antecipar últimas parcelas
  anticipateCount: number
  anticipateSaved: number
  /** Valor maior que o saldo: quita e sobra. */
  paysOff: boolean
  leftover: number
  estimated: boolean
}

export function compareAmortization(financings: Financing[], amount: number): AmortOption[] {
  const out: AmortOption[] = []
  for (const f of financings) {
    const s = summarizeFinancing(f)
    if (s.remainingCount === 0 || s.balance <= 0) continue
    const st = loanStateFrom(s)
    const index = Math.max(0, f.indexMonthly ?? 0)
    const monthlyCost = (1 + st.rate) * (1 + index) - 1
    const use = Math.min(amount, st.balance)
    const e = extraordinaryPayment(st, use)
    const a = anticipateLast(st, use)
    // parcela como aparece no boleto (inclui seguros e taxas)
    const fees = s.resolved.fees
    const currentPayment = (st.system === 'PRICE' ? st.payment : st.amortization + st.balance * st.rate) + fees
    out.push({
      id: f.id,
      name: f.name,
      type: f.type,
      institution: f.institution,
      balance: s.balance,
      remaining: s.remainingCount,
      monthlyCost,
      annualCost: monthlyToAnnual(monthlyCost),
      indexMonthly: index,
      currentPayment: round2(currentPayment),
      endDate: e.base.endDate,
      monthsSaved: e.monthsSaved,
      interestSavedTerm: e.interestSavedTerm,
      newEndDate: e.reducedTerm.endDate,
      newPayment: round2(e.newPayment + fees),
      monthlyRelief: round2(currentPayment - e.newPayment - fees),
      interestSavedPayment: e.interestSavedPayment,
      anticipateCount: a.count,
      anticipateSaved: a.interestSaved,
      paysOff: amount >= st.balance,
      leftover: round2(Math.max(0, amount - st.balance)),
      estimated: s.balanceSource === 'calculado' || s.resolved.rateEstimated,
    })
  }
  // maior custo primeiro: é onde cada real abatido economiza mais
  return out.sort((x, y) => y.monthlyCost - x.monthlyCost)
}
