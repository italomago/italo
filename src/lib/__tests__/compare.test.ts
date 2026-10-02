import { describe, expect, it } from 'vitest'
import { compareAmortization } from '../compare'
import type { Financing } from '../types'

const base = { institution: '', asset: '', paidCount: 0 }
const fins: Financing[] = [
  { ...base, id: 'casa', name: 'Casa', type: 'imovel', financedValue: 195556.1, monthlyRate: 0.0484 / 12, n: 360, firstDate: '2021-01-15', paidCount: 69, system: 'SAC', balanceInformed: 260009.7, monthlyFees: 115.76, indexMonthly: 0.0035 },
  { ...base, id: 'carro', name: 'Carro', type: 'veiculo', financedValue: 62115.43, monthlyRate: 0.0103, n: 60, installment: 1393.05, firstDate: '2026-06-15', paidCount: 4, system: 'PRICE', balanceInformed: 59063.67 },
  { ...base, id: 'pro', name: 'Proampe', type: 'emprestimo', financedValue: 40000, monthlyRate: 0.0162, n: 36, firstDate: '2025-07-20', paidCount: 15, system: 'SAC', balanceInformed: 23333.35 },
]

describe('onde amortizar', () => {
  it('ordena pelo custo efetivo mensal (maior primeiro)', () => {
    const r = compareAmortization(fins, 3000)
    expect(r.map((x) => x.name)).toEqual(['Proampe', 'Carro', 'Casa'])
    expect(r[2].monthlyCost).toBeCloseTo((1 + 0.0484 / 12) * 1.0035 - 1, 10)
  })
  it('calcula as opções com R$ 3.000', () => {
    const [pro, carro, casa] = compareAmortization(fins, 3000)
    expect(pro.monthsSaved).toBe(2)
    expect(pro.newPayment).toBeCloseTo(1297.66, 1)
    expect(pro.monthlyRelief).toBeCloseTo(1489.11 - 1297.66, 0)
    expect(carro.monthsSaved).toBe(3)
    expect(carro.newPayment).toBeCloseTo(1322.48, 1)
    expect(casa.monthsSaved).toBe(3)
    expect(casa.paysOff).toBe(false)
    // parcela da casa inclui seguro e taxa (R$ 115,76), como no boleto
    expect(casa.currentPayment).toBeCloseTo(2057.97, 0)
    expect(casa.monthlyRelief).toBeCloseTo(1942.21 - 1919.8, 1)
  })
  it('valor maior que o saldo quita e mostra a sobra', () => {
    const pro = compareAmortization(fins, 30000).find((x) => x.name === 'Proampe')!
    expect(pro.paysOff).toBe(true)
    expect(pro.leftover).toBeCloseTo(30000 - 23333.35, 2)
    expect(pro.newEndDate).toBeNull()
  })
  it('ignora financiamentos quitados', () => {
    const quitado = { ...fins[1], id: 'q', paidCount: 60, balanceInformed: undefined }
    expect(compareAmortization([quitado], 1000)).toHaveLength(0)
  })
})
