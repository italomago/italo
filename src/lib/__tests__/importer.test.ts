import { describe, expect, it } from 'vitest'
import { parseImport, sameName } from '../importer'

const sample = JSON.stringify({
  app: 'minhas-financas-importar',
  financings: [
    { name: 'Carro', type: 'veiculo', institution: 'Banco', financedValue: 62115.43, monthlyRate: 0.0103, n: 60, installment: 1393.05, firstDate: '2026-06-15', paidCount: 4, system: 'PRICE', balanceInformed: 59063.67 },
  ],
  removeRecurrences: ['Carro'],
})

describe('importar cadastro colado', () => {
  it('lê financiamentos e despesas a remover', () => {
    const p = parseImport(sample)
    expect(p.financings).toHaveLength(1)
    expect(p.financings[0]).toMatchObject({ name: 'Carro', n: 60, paidCount: 4, system: 'PRICE', monthlyRate: 0.0103 })
    expect(p.removeRecurrences).toEqual(['Carro'])
  })
  it('recusa texto inválido ou de outro tipo', () => {
    expect(() => parseImport('abc')).toThrow(/inválido/)
    expect(() => parseImport('{"app":"outro"}')).toThrow(/não é um cadastro/)
    expect(() => parseImport(JSON.stringify({ app: 'minhas-financas-importar', financings: [{ name: 'X' }] }))).toThrow(/incompleto/)
  })
  it('compara nomes sem acento e maiúsculas', () => {
    expect(sameName('Proampe ', 'PROAMPE')).toBe(true)
    expect(sameName('Água', 'agua')).toBe(true)
  })
})
