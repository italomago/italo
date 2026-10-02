import { describe, expect, it } from 'vitest'
import {
  annualToMonthly,
  anticipateLast,
  buildSchedule,
  extraMonthly,
  extraordinaryPayment,
  futurePayments,
  loanStateFrom,
  monthlyToAnnual,
  monthsToGoal,
  monthsToPayoff,
  pmt,
  presentValue,
  resolveFinancing,
  runPayoff,
  solveRate,
  summarizeFinancing,
} from '../finance'

const close = (a: number, b: number, tol = 0.01) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol)

describe('taxas e prestação', () => {
  it('PMT da Tabela Price confere com valores conhecidos', () => {
    close(pmt(10000, 0.01, 12), 888.49)
    close(pmt(80000, 0.015, 48), 2350.0)
    close(pmt(1200, 0, 10), 120)
  })
  it('conversão de taxa anual ↔ mensal', () => {
    close(annualToMonthly(0.12682503), 0.01, 1e-8)
    close(monthlyToAnnual(0.01), 0.12682503, 1e-8)
    close(annualToMonthly(monthlyToAnnual(0.0199)), 0.0199, 1e-12)
  })
  it('descobre a taxa a partir da parcela', () => {
    close(solveRate(10000, 888.49, 12), 0.01, 1e-5)
    close(solveRate(80000, 2350, 48), 0.015, 1e-5)
    expect(solveRate(1200, 100, 12)).toBe(0)
  })
  it('valor presente é o inverso do PMT', () => {
    close(presentValue(pmt(50000, 0.012, 60), 0.012, 60), 50000)
  })
  it('meses para quitar', () => {
    expect(monthsToPayoff(10000, 0.01, pmt(10000, 0.01, 12))).toBe(12)
    expect(monthsToPayoff(1000, 0.05, 50)).toBe(Infinity)
    expect(monthsToPayoff(1000, 0, 100)).toBe(10)
  })
})

describe('cronograma', () => {
  it('Price: amortização soma o principal e saldo final zera', () => {
    const r = resolveFinancing({ financedValue: 80000, monthlyRate: 0.015, n: 48, firstDate: '2026-10-10', system: 'PRICE' })
    const s = buildSchedule(r, '2026-10-10')
    expect(s).toHaveLength(48)
    close(s.reduce((a, x) => a + x.amortization, 0), 80000, 0.05)
    expect(s[47].balance).toBe(0)
    close(s[0].interest, 1200)
    close(s[0].payment, 2350)
    expect(s[0].date).toBe('2026-10-10')
    expect(s[3].date).toBe('2027-01-10')
    expect(s[47].date).toBe('2030-09-10')
    // juros totais = total pago - principal
    close(s.reduce((a, x) => a + x.interest, 0), 2350.0 * 48 - 80000, 0.5)
  })
  it('SAC: amortização constante e juros decrescentes', () => {
    const r = resolveFinancing({ financedValue: 120000, monthlyRate: 0.01, n: 120, firstDate: '2026-01-31', system: 'SAC' })
    const s = buildSchedule(r, '2026-01-31')
    close(s[0].payment, 2200)
    close(s[119].payment, 1010)
    close(s.reduce((a, x) => a + x.interest, 0), 72600, 0.05)
    expect(s[119].balance).toBe(0)
    expect(s[1].date).toBe('2026-02-28') // dia 31 ajustado para fevereiro
    expect(s[2].date).toBe('2026-03-31')
  })
  it('parcela maior que a calculada vira encargos mensais', () => {
    const r = resolveFinancing({ financedValue: 10000, monthlyRate: 0.01, n: 12, installment: 920, firstDate: '2026-01-10', system: 'PRICE' })
    close(r.fees, 920 - 888.49)
    const s = buildSchedule(r, '2026-01-10')
    close(s[0].payment, 920)
    expect(s[11].balance).toBe(0)
  })
  it('sem taxa: estima pela parcela e avisa', () => {
    const r = resolveFinancing({ financedValue: 80000, n: 48, installment: 2350, firstDate: '2026-10-10' })
    expect(r.rateEstimated).toBe(true)
    expect(r.systemAssumed).toBe(true)
    close(r.rate, 0.015, 1e-5)
    expect(r.warnings.length).toBeGreaterThan(0)
  })
  it('sem taxa e sem parcela: sem juros', () => {
    const r = resolveFinancing({ financedValue: 80000, n: 48, firstDate: '2026-10-10' })
    expect(r.rate).toBe(0)
    close(r.corePayment, 80000 / 48)
  })
  it('valor financiado = valor do bem - entrada', () => {
    const r = resolveFinancing({ assetValue: 100000, downPayment: 20000, monthlyRate: 0.015, n: 48, firstDate: '2026-10-10' })
    expect(r.principal).toBe(80000)
  })
})

describe('resumo do financiamento', () => {
  const f = { financedValue: 80000, monthlyRate: 0.015, n: 48, firstDate: '2026-10-10', system: 'PRICE' as const }
  it('calcula pago, restante, juros e percentuais', () => {
    const s = summarizeFinancing({ ...f, paidCount: 12 })
    expect(s.paidCount).toBe(12)
    expect(s.remainingCount).toBe(36)
    close(s.totalPaid, 2350 * 12, 0.1)
    close(s.totalRemaining, 2350 * 36, 0.5)
    close(s.totalPaid + s.totalRemaining, s.totalCost, 0.01)
    close(s.pctPaid + s.pctRemaining, 1, 1e-9)
    close(s.balance, presentValue(pmt(80000, 0.015, 48), 0.015, 36), 0.05)
    expect(s.payoffDate).toBe('2030-09-10')
    expect(s.nextInstallment?.k).toBe(13)
    close(s.interestPaid + s.interestRemaining, s.totalInterest, 0.02)
  })
  it('usa o saldo devedor informado pela instituição', () => {
    const s = summarizeFinancing({ ...f, paidCount: 12, balanceInformed: 60000 })
    expect(s.balance).toBe(60000)
    expect(s.balanceSource).toBe('informado')
    const st = loanStateFrom(s)
    close(st.payment, pmt(60000, 0.015, 36))
  })
})

describe('simulações', () => {
  const s = summarizeFinancing({ financedValue: 10000, monthlyRate: 0.01, n: 12, firstDate: '2026-11-05', system: 'PRICE' })
  const st = loanStateFrom(s)

  it('quitação normal reproduz o cronograma', () => {
    const r = runPayoff(st)
    expect(r.months).toBe(12)
    close(r.totalInterest, s.interestRemaining, 0.05)
    expect(r.endDate).toBe('2027-10-05')
  })
  it('valor presente das parcelas futuras = saldo devedor', () => {
    const pv = futurePayments(st).reduce((a, p, i) => a + p / Math.pow(1.01, i + 1), 0)
    close(pv, 10000, 0.01)
  })
  it('antecipar parcelas do fim com desconto de juros', () => {
    const one = anticipateLast(st, 800)
    expect(one.count).toBe(1)
    close(one.amountUsed, pmt(10000, 0.01, 12) / Math.pow(1.01, 12))
    close(one.interestSaved, pmt(10000, 0.01, 12) - one.amountUsed)
    expect(one.newRemaining).toBe(11)
    expect(one.newPayoffDate).toBe('2027-09-05')
    close(one.leftover, 800 - one.amountUsed)

    const all = anticipateLast(st, 10000.01)
    expect(all.count).toBe(12)
    close(all.interestSaved, pmt(10000, 0.01, 12) * 12 - 10000, 0.05)
    expect(all.newPayoffDate).toBeNull()

    const none = anticipateLast(st, 100)
    expect(none.count).toBe(0)
    expect(none.leftover).toBe(100)
  })
  it('pagamento extraordinário: reduzir prazo ou reduzir parcela', () => {
    const r = extraordinaryPayment(st, 3000)
    expect(r.newBalance).toBe(7000)
    expect(r.reducedTerm.months).toBe(monthsToPayoff(7000, 0.01, st.payment))
    expect(r.monthsSaved).toBe(12 - r.reducedTerm.months)
    expect(r.interestSavedTerm).toBeGreaterThan(0)
    close(r.newPayment, pmt(7000, 0.01, 12))
    // reduzir prazo economiza mais juros que reduzir parcela
    expect(r.interestSavedTerm).toBeGreaterThan(r.interestSavedPayment)
    // juros após reduzir parcela = 12 * novaParcela - 7000
    close(r.base.totalInterest - r.interestSavedPayment, pmt(7000, 0.01, 12) * 12 - 7000, 0.05)
    const full = extraordinaryPayment(st, 20000)
    expect(full.reducedTerm.months).toBe(0)
    expect(full.newBalance).toBe(0)
  })
  it('pagamento extra mensal encurta o prazo', () => {
    const r = extraMonthly(st, 500)
    expect(r.withExtra.months).toBeLessThan(12)
    expect(r.interestSaved).toBeGreaterThan(0)
    // total amortizado é o mesmo: total pago - juros = saldo
    close(r.withExtra.totalPaid - r.withExtra.totalInterest, 10000, 0.05)
    expect(extraMonthly(st, 0).monthsSaved).toBe(0)
  })
  it('SAC: simulação reproduz cronograma e extras reduzem prazo', () => {
    const sac = summarizeFinancing({ financedValue: 120000, monthlyRate: 0.01, n: 120, firstDate: '2026-11-10', system: 'SAC', paidCount: 20 })
    const sst = loanStateFrom(sac)
    const base = runPayoff(sst)
    expect(base.months).toBe(100)
    close(base.totalInterest, sac.interestRemaining, 0.1)
    const ex = extraordinaryPayment(sst, 10000)
    expect(ex.reducedTerm.months).toBe(90)
    const ant = anticipateLast(sst, 5000)
    expect(ant.count).toBeGreaterThan(0)
  })
  it('juros zero', () => {
    const z = loanStateFrom(summarizeFinancing({ financedValue: 1200, n: 12, firstDate: '2026-11-01' }))
    expect(runPayoff(z).months).toBe(12)
    expect(runPayoff(z).totalInterest).toBe(0)
    expect(anticipateLast(z, 300).count).toBe(3)
    expect(anticipateLast(z, 300).interestSaved).toBe(0)
  })
})

describe('metas', () => {
  it('meses para atingir', () => {
    expect(monthsToGoal(50000, 1000)).toBe(50)
    expect(monthsToGoal(50000, 1001)).toBe(50)
    expect(monthsToGoal(0, 100)).toBe(0)
    expect(monthsToGoal(100, 0)).toBe(Infinity)
    // com rendimento de 1% a.m. chega antes
    expect(monthsToGoal(12000, 1000, 0.01)).toBe(12)
  })
})
