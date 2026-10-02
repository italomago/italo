import { describe, expect, it } from 'vitest'
import { parseBulk, parseBulkLine } from '../bulk'

describe('cadastro em lote de despesas fixas', () => {
  it('lê nome, valor e dia em texto livre', () => {
    expect(parseBulkLine('casa R$ 2.061,30')).toEqual({ name: 'Casa', amount: 2061.3, day: undefined, categoryId: 'casa' })
    expect(parseBulkLine('CARRO r$1400')).toMatchObject({ name: 'Carro', amount: 1400, categoryId: 'veiculo' })
    expect(parseBulkLine('linha de credito Sicred R$ 1.176,64')).toMatchObject({ name: 'Linha de Credito Sicred', amount: 1176.64, categoryId: 'dividas' })
    expect(parseBulkLine('gazin  175  todo dia 15')).toMatchObject({ name: 'Gazin', amount: 175, day: 15, categoryId: 'compras' })
    expect(parseBulkLine('avenida          todo dia 20')).toMatchObject({ name: 'Avenida', amount: 0, day: 20 })
    expect(parseBulkLine('Havan R$')).toMatchObject({ name: 'Havan', amount: 0 })
    expect(parseBulkLine('stralink        275')).toMatchObject({ name: 'Stralink', amount: 275, categoryId: 'assinaturas' })
    expect(parseBulkLine('dona rita  R$ 50,00')).toMatchObject({ name: 'Dona Rita', amount: 50 })
    expect(parseBulkLine('cartao neon')).toMatchObject({ name: 'Cartao Neon', amount: 0, categoryId: 'dividas' })
  })
  it('lê o formato nome; valor; dia', () => {
    expect(parseBulkLine('Energia; ; 10')).toEqual({ name: 'Energia', amount: 0, day: 10, categoryId: 'casa' })
    expect(parseBulkLine('JBS')).toMatchObject({ name: 'JBS' })
    expect(parseBulkLine('CARTAO CREDISIS')).toMatchObject({ name: 'Cartao Credisis', categoryId: 'dividas' })
    expect(parseBulkLine('Linha de crédito Sicredi; 1.176,64')).toMatchObject({ name: 'Linha de Crédito Sicredi', amount: 1176.64, categoryId: 'dividas' })
    expect(parseBulkLine('Rolim Net; 124; 5')).toMatchObject({ name: 'Rolim Net', amount: 124, day: 5, categoryId: 'assinaturas' })
  })
  it('ignora linhas vazias', () => {
    expect(parseBulk('casa 100\n\n  \nagua')).toHaveLength(2)
  })
})
