import { describe, expect, it } from 'vitest'
import { parseQuick } from '../parser'
import type { Card } from '../types'

const cards: Card[] = [
  { id: 'nu', name: 'Nubank', bank: 'Nubank', limit: 5000, closingDay: 3, dueDay: 10 },
  { id: 'it', name: 'Itaú Visa', bank: 'Itaú', limit: 3000, closingDay: 25, dueDay: 5 },
]
const REF = '2026-10-02'

describe('lançamento rápido', () => {
  it('Mercado Livre — R$ 1.200 — 10x cartão', () => {
    const r = parseQuick('Mercado Livre — R$ 1.200 — 10x cartão', cards, REF)
    expect(r.type).toBe('compra')
    expect(r.platform).toBe('Mercado Livre')
    expect(r.amount).toBe(1200)
    expect(r.installments).toBe(10)
    expect(r.method).toBe('Crédito')
    expect(r.cardId).toBeUndefined() // dois cartões: pergunta qual
    expect(r.categoryId).toBe('compras')
  })
  it('identifica o cartão pelo nome', () => {
    const r = parseQuick('Amazon fone 350 3x nubank', cards, REF)
    expect(r.cardId).toBe('nu')
    expect(r.amount).toBe(350)
    expect(r.installments).toBe(3)
    expect(r.description.toLowerCase()).toContain('fone')
  })
  it('Financiamento Duster — R$ 80.000 — 48x — primeira parcela 10/10/2026', () => {
    const r = parseQuick('Financiamento Duster — R$ 80.000 — 48x — primeira parcela 10/10/2026', cards, REF)
    expect(r.type).toBe('financiamento')
    expect(r.amount).toBe(80000)
    expect(r.installments).toBe(48)
    expect(r.date).toBe('2026-10-10')
    expect(r.description).toBe('Duster')
  })
  it('Salário — R$ 5.000 — todo dia 5', () => {
    const r = parseQuick('Salário — R$ 5.000 — todo dia 5', cards, REF)
    expect(r.type).toBe('entrada')
    expect(r.amount).toBe(5000)
    expect(r.recurringDay).toBe(5)
    expect(r.origin).toBe('Salário')
  })
  it('despesa simples com categoria e forma de pagamento', () => {
    const r = parseQuick('mercado 230,50 pix', cards, REF)
    expect(r.type).toBe('saida')
    expect(r.amount).toBe(230.5)
    expect(r.method).toBe('Pix')
    expect(r.categoryId).toBe('mercado')
    expect(r.description).toBe('Mercado')
  })
  it('gasolina e valor sem R$', () => {
    const r = parseQuick('Gasolina posto 150', cards, REF)
    expect(r.categoryId).toBe('combustivel')
    expect(r.amount).toBe(150)
  })
  it('entrada de venda', () => {
    const r = parseQuick('Recebi 300 da venda da bicicleta', cards, REF)
    expect(r.type).toBe('entrada')
    expect(r.origin).toBe('Venda')
    expect(r.amount).toBe(300)
  })
  it('meta', () => {
    const r = parseQuick('Meta viagem 15 mil', cards, REF)
    expect(r.type).toBe('meta')
    expect(r.amount).toBe(15000)
    expect(r.description).toBe('Viagem')
  })
})
