import { describe, expect, it } from 'vitest'
import { planPayoff } from '../payoff'
import { debtDrafts } from '../generate'
import type { Debt, Transaction } from '../types'

const REF = '2026-10-02'
const open = (id: string, name: string, kind: Debt['kind'], balance: number, extra: Partial<Debt> = {}): Debt => ({
  id,
  name,
  creditor: '',
  amount: balance,
  firstDue: REF,
  recurring: false,
  installments: 1,
  paidCount: 0,
  status: 'ativa',
  kind,
  balance,
  scheduled: false,
  ...extra,
})

const debts: Debt[] = [
  open('p', 'Protesto', 'protesto', 1200),
  open('n', 'Loja', 'negativado', 3000, { offer: 900 }),
  open('c', 'Cartão antigo', 'cartao', 2000, { interest: 0.05 }),
]

describe('plano de pagamento das dívidas', () => {
  it('dívida sem acordo não gera lançamentos', () => {
    expect(debtDrafts(debts[0], '2027-10-31')).toHaveLength(0)
  })
  it('menores primeiro: paga a proposta mais barata antes', () => {
    const r = planPayoff(debts, [], 500, 'menores', { ref: REF })
    expect(r.steps.map((s) => s.id)).toEqual(['n', 'p', 'c'])
    // proposta de 900: junta 500 + 500 e quita no 2º mês, sobram 100
    expect(r.steps[0].paidMonth).toBe('2026-11')
    expect(r.steps[0].paid).toBe(900)
    expect(r.steps[0].saved).toBe(2100)
    expect(r.totalSaved).toBe(2100)
    expect(r.neverEnds).toBe(false)
  })
  it('protestos primeiro coloca o protesto na frente', () => {
    const r = planPayoff(debts, [], 500, 'protestos', { ref: REF })
    expect(r.steps[0].id).toBe('p')
    expect(r.steps[0].paidMonth).toBe('2026-12') // 3 × 500 ≥ 1.200
  })
  it('mais caras primeiro e juros aumentam o saldo', () => {
    const r = planPayoff(debts, [], 500, 'caras', { ref: REF })
    expect(r.steps[0].id).toBe('c')
    expect(r.steps[0].paid).toBeGreaterThan(2000) // pagou juros de 5% ao mês enquanto quitava
  })
  it('sem valor mensal não termina', () => {
    const r = planPayoff(debts, [], 0, 'menores', { ref: REF, rollover: false })
    expect(r.neverEnds).toBe(true)
    expect(r.debtFreeMonth).toBeNull()
  })
  it('acordo que termina libera a parcela para as outras dívidas', () => {
    const acordo: Debt = { id: 'a', name: 'Acordo', creditor: '', amount: 300, firstDue: '2026-10-10', recurring: true, installments: 2, paidCount: 0, status: 'ativa', kind: 'acordo' }
    const txs: Transaction[] = debtDrafts(acordo, '2027-12-31').map((d, k) => ({ ...d, id: 'x' + k, createdAt: 0, paid: false }))
    const only = [open('p', 'Protesto', 'protesto', 1200), acordo]
    const sem = planPayoff(only, txs, 200, 'menores', { ref: REF, rollover: false })
    const com = planPayoff(only, txs, 200, 'menores', { ref: REF, rollover: true })
    expect(sem.scheduled[0]).toMatchObject({ remaining: 2, endMonth: '2026-11' })
    expect(sem.steps[0].paidMonth).toBe('2027-03') // 6 × 200
    expect(com.steps[0].paidMonth).toBe('2027-01') // out 200 + nov 200 + dez 500 + jan 500 ≥ 1.200
    expect(com.debtFreeMonth).toBe('2027-01')
  })
})

describe('acordo com datas escolhidas', () => {
  it('gera uma parcela por data, com o valor de cada uma', () => {
    const d: Debt = {
      id: 'x', name: 'Acordo 32 mil', creditor: 'Banco', amount: 8000, firstDue: '2026-10-20', recurring: true, installments: 4, paidCount: 1,
      status: 'ativa', kind: 'acordo',
      customSchedule: [
        { date: '2027-03-10', amount: 8000 },
        { date: '2026-10-20', amount: 8000 },
        { date: '2026-12-15', amount: 8000 },
        { date: '2027-07-30', amount: 8000 },
      ],
    }
    const drafts = debtDrafts(d, '2027-12-31')
    expect(drafts.map((x) => x.date)).toEqual(['2026-10-20', '2026-12-15', '2027-03-10', '2027-07-30'])
    expect(drafts.map((x) => x.amount)).toEqual([8000, 8000, 8000, 8000])
    expect(drafts.map((x) => x.paid)).toEqual([true, false, false, false])
    expect(drafts[3].installment).toEqual({ n: 4, total: 4 })
    const txs: Transaction[] = drafts.map((x, k) => ({ ...x, id: 'y' + k, createdAt: 0, paid: !!x.paid }))
    const plan = planPayoff([d], txs, 0, 'menores', { ref: REF })
    expect(plan.scheduled[0]).toMatchObject({ remaining: 3, remainingValue: 24000, endMonth: '2027-07', installment: 0 })
  })
})
