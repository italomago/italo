import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { addMonths, parseBRDate, setToday } from '../dates'
import { parseMoney, splitInstallments } from '../money'
import { debtDrafts, financingDrafts, invoiceClosingDate, invoiceFor, mergeSource, purchaseDrafts, recurrenceDates, regenerateAll } from '../generate'
import { emptyData } from '../defaults'
import { accountBalance, bucketOf, cardUsage, computeAlerts, currentBalance, forecast, periodStats, projectedBalance } from '../projections'
import type { AppData, Card, Purchase } from '../types'

beforeEach(() => setToday('2026-10-02'))
afterEach(() => setToday(null))

describe('dinheiro e datas', () => {
  it('lê valores no padrão brasileiro', () => {
    expect(parseMoney('1.200')).toBe(1200)
    expect(parseMoney('R$ 80.000')).toBe(80000)
    expect(parseMoney('1.200,50')).toBe(1200.5)
    expect(parseMoney('12,5')).toBe(12.5)
    expect(parseMoney('1200.5')).toBe(1200.5)
    expect(parseMoney('80 mil')).toBe(80000)
    expect(parseMoney('1.234.567,89')).toBe(1234567.89)
    expect(parseMoney('abc')).toBeNull()
  })
  it('divide parcelas com centavos exatos', () => {
    expect(splitInstallments(1200, 10)).toEqual(Array(10).fill(120))
    const p = splitInstallments(100, 3)
    expect(p).toEqual([33.34, 33.33, 33.33])
    expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 10)
  })
  it('soma meses respeitando fim do mês', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29')
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15')
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28')
    expect(parseBRDate('10/10/2026')).toBe('2026-10-10')
    expect(parseBRDate('5/1')).toBe('2026-01-05')
    expect(parseBRDate('31/02/2026')).toBeNull()
  })
})

const nubank: Card = { id: 'nu', name: 'Nubank', bank: 'Nubank', limit: 5000, closingDay: 3, dueDay: 10 }
const late: Card = { id: 'it', name: 'Itaú', bank: 'Itaú', limit: 3000, closingDay: 25, dueDay: 5 }

describe('cartão de crédito', () => {
  it('compra antes do fechamento cai na fatura do mês; no dia do fechamento ou depois, na seguinte', () => {
    expect(invoiceFor(nubank, '2026-10-02')).toBe('2026-10')
    expect(invoiceFor(nubank, '2026-10-03')).toBe('2026-11')
    expect(invoiceFor(late, '2026-10-20')).toBe('2026-11')
    expect(invoiceFor(late, '2026-10-26')).toBe('2026-12')
    expect(invoiceFor(late, '2026-12-28')).toBe('2027-02')
    expect(invoiceClosingDate(late, '2026-11')).toBe('2026-10-25')
    expect(invoiceClosingDate(nubank, '2026-11')).toBe('2026-11-03')
  })
  it('compra parcelada distribui as parcelas nas faturas futuras', () => {
    const p: Purchase = { id: 'p1', platform: 'Mercado Livre', product: 'Celular', total: 1200, date: '2026-10-05', method: 'Crédito', installments: 10, cardId: 'nu', status: 'aguardando' }
    const d = purchaseDrafts(p, [nubank])
    expect(d).toHaveLength(10)
    expect(d.every((x) => x.amount === 120)).toBe(true)
    expect(d[0].invoice).toBe('2026-11')
    expect(d[0].date).toBe('2026-11-10')
    expect(d[9].invoice).toBe('2027-08')
    expect(d[9].installment).toEqual({ n: 10, total: 10 })
  })
  it('limite disponível desconta parcelas futuras em aberto', () => {
    let data: AppData = { ...emptyData(), cards: [nubank] }
    data.purchases = [{ id: 'p1', platform: 'Amazon', product: 'TV', total: 3000, date: '2026-10-05', method: 'Crédito', installments: 10, cardId: 'nu', status: 'entregue' }]
    data = regenerateAll(data)
    const u = cardUsage(data, nubank)
    expect(u.used).toBe(3000)
    expect(u.available).toBe(2000)
    expect(u.openInvoice).toBe('2026-10')
    expect(u.next[0].month).toBe('2026-11')
    expect(u.next[0].total).toBe(300)
  })
  it('compra antiga registrada agora: parcelas vencidas entram como pagas', () => {
    let data: AppData = { ...emptyData(), cards: [nubank] }
    data.purchases = [{ id: 'p1', platform: 'Shopee', product: 'Fone', total: 600, date: '2026-06-01', method: 'Crédito', installments: 6, cardId: 'nu', status: 'entregue' }]
    data = regenerateAll(data)
    const txs = data.transactions.filter((t) => t.source.id === 'p1')
    // faturas 06,07,08,09 (vencidas) pagas; 10 (vence 10/10) e 11 em aberto
    expect(txs.filter((t) => t.paid)).toHaveLength(4)
    expect(cardUsage(data, nubank).used).toBe(200)
  })
})

describe('recorrências, dívidas e financiamentos', () => {
  it('salário todo dia 5 lança os próximos meses', () => {
    const dates = recurrenceDates({ id: 'r', kind: 'in', description: 'Salário', amount: 5000, variable: false, day: 5, frequency: 'mensal', start: '2026-10-02', active: true }, '2027-10-31')
    expect(dates[0]).toBe('2026-10-05')
    expect(dates).toHaveLength(13)
    expect(dates[12]).toBe('2027-10-05')
  })
  it('dia 31 vira último dia do mês e respeita data final', () => {
    const dates = recurrenceDates({ id: 'r', kind: 'out', description: 'Aluguel', amount: 1500, variable: false, day: 31, frequency: 'mensal', start: '2026-10-02', end: '2027-03-01', active: true }, '2027-10-31')
    expect(dates).toEqual(['2026-10-31', '2026-11-30', '2026-12-31', '2027-01-31', '2027-02-28'])
  })
  it('semanal e anual', () => {
    const w = recurrenceDates({ id: 'r', kind: 'out', description: 'x', amount: 1, variable: false, day: 1, frequency: 'semanal', start: '2026-10-02', active: true }, '2026-10-31')
    expect(w).toEqual(['2026-10-02', '2026-10-09', '2026-10-16', '2026-10-23', '2026-10-30'])
    const y = recurrenceDates({ id: 'r', kind: 'out', description: 'x', amount: 1, variable: false, day: 15, frequency: 'anual', start: '2026-01-01', active: true }, '2028-12-31')
    expect(y).toEqual(['2026-01-15', '2027-01-15', '2028-01-15'])
  })
  it('dívida parcelada marca as parcelas já pagas', () => {
    const d = debtDrafts({ id: 'd', name: 'Empréstimo', creditor: 'Banco', amount: 500, firstDue: '2026-08-15', recurring: true, installments: 10, paidCount: 2, status: 'ativa' }, '2027-10-31')
    expect(d).toHaveLength(10)
    expect(d.filter((x) => x.paid)).toHaveLength(2)
    expect(d[2].date).toBe('2026-10-15')
  })
  it('financiamento Duster: 48 parcelas a partir de 10/10/2026', () => {
    const d = financingDrafts({ id: 'f', name: 'Duster', institution: 'Banco', type: 'veiculo', asset: 'Duster', financedValue: 80000, monthlyRate: 0.015, n: 48, firstDate: '2026-10-10', paidCount: 0, system: 'PRICE' })
    expect(d).toHaveLength(48)
    expect(d[0].date).toBe('2026-10-10')
    expect(d[47].date).toBe('2030-09-10')
    expect(d[0].amount).toBeCloseTo(2350, 1)
  })
  it('regerar preserva o status pago e valores editados', () => {
    let data: AppData = emptyData()
    data.recurrences = [{ id: 'r', kind: 'out', description: 'Energia', amount: 200, variable: true, day: 10, frequency: 'mensal', start: '2026-10-02', active: true }]
    data = regenerateAll(data)
    const t = data.transactions.find((x) => x.date === '2026-10-10')!
    t.paid = true
    const t2 = data.transactions.find((x) => x.date === '2026-11-10')!
    t2.amount = 250
    t2.edited = true
    data.recurrences[0].amount = 220
    data = regenerateAll(data)
    expect(data.transactions.find((x) => x.date === '2026-10-10')!.paid).toBe(true)
    expect(data.transactions.find((x) => x.date === '2026-11-10')!.amount).toBe(250)
    expect(data.transactions.find((x) => x.date === '2026-12-10')!.amount).toBe(220)
    // mergeSource sem rascunhos remove os lançamentos
    expect(mergeSource(data.transactions, 'recurring', 'r', []).length).toBe(0)
  })
})

describe('saldos e projeções', () => {
  function sample(): AppData {
    let data: AppData = emptyData()
    data.accounts[0].initialBalance = 1000
    data.accounts[0].balanceDate = '2026-10-01'
    data.cards = [nubank]
    data.recurrences = [
      { id: 'sal', kind: 'in', description: 'Salário', amount: 5000, variable: false, day: 5, frequency: 'mensal', start: '2026-10-02', active: true },
      { id: 'alu', kind: 'out', description: 'Aluguel', amount: 1500, variable: false, day: 10, frequency: 'mensal', start: '2026-10-02', active: true },
    ]
    data.purchases = [{ id: 'p', platform: 'Mercado Livre', product: 'Notebook', total: 1200, date: '2026-10-05', method: 'Crédito', installments: 10, cardId: 'nu', status: 'aguardando' }]
    data.transactions = [
      { id: 'm1', kind: 'out', amount: 200, date: '2026-10-01', description: 'Mercado', categoryId: 'mercado', method: 'Pix', paid: true, source: { type: 'manual' }, createdAt: 0 },
      { id: 'old', kind: 'out', amount: 999, date: '2026-09-20', description: 'Antes do saldo inicial', paid: true, source: { type: 'manual' }, createdAt: 0 },
    ]
    return regenerateAll(data)
  }
  it('saldo atual considera apenas pagos após a data do saldo inicial', () => {
    const data = sample()
    expect(currentBalance(data)).toBe(800)
    expect(accountBalance(data, 'principal')).toBe(800)
  })
  it('previsão do fim do mês e próximos meses', () => {
    const data = sample()
    // outubro: 800 + 5000 - 1500 = 4300 (compra cai em novembro)
    expect(projectedBalance(data, '2026-10-31')).toBe(4300)
    const f = forecast(data, 12)
    expect(f[0].month).toBe('2026-10')
    expect(f[0].balance).toBe(4300)
    expect(f[1].income).toBe(5000)
    expect(f[1].purchases).toBe(120)
    expect(f[1].totalOut).toBe(1620)
    expect(f[1].balance).toBe(4300 + 5000 - 1620)
    expect(f[1].commitment).toBeCloseTo(120 / 5000, 10)
    // saldo de cada mês = anterior + entradas - saídas
    for (let i = 1; i < f.length; i++) expect(f[i].balance).toBeCloseTo(f[i - 1].balance + f[i].income - f[i].totalOut, 2)
  })
  it('totais do período', () => {
    const data = sample()
    const s = periodStats(data, { start: '2026-10-01', end: '2026-10-31' })
    expect(s.income).toBe(5000)
    expect(s.expenses).toBe(1700)
    expect(s.paid).toBe(200)
    expect(s.toPay).toBe(1500)
    expect(s.byCategory[0].value).toBe(1500)
  })
  it('situação das contas e alertas', () => {
    const data = sample()
    const t = data.transactions.find((x) => x.source.id === 'alu' && x.date === '2026-10-10')!
    expect(bucketOf(t)).toBe('30dias') // 8 dias à frente
    expect(bucketOf(t, '2026-10-05')).toBe('7dias')
    expect(bucketOf(t, '2026-10-10')).toBe('hoje')
    expect(bucketOf(t, '2026-10-11')).toBe('vencidas')
    const alerts = computeAlerts(data, '2026-10-11')
    expect(alerts.some((a) => a.id === 'late-' + t.id)).toBe(true)
  })
  it('alerta de saldo projetado negativo', () => {
    const data = sample()
    data.transactions.push({ id: 'big', kind: 'out', amount: 20000, date: '2026-12-01', description: 'Grande', paid: false, source: { type: 'manual' }, createdAt: 0 })
    expect(computeAlerts(data).some((a) => a.title === 'Saldo projetado negativo')).toBe(true)
  })
})

describe('painel de cartões', () => {
  it('gasto do mês conta a compra inteira na data da compra; limite se divide entre faturas', async () => {
    const { cardSpending, limitBreakdown } = await import('../projections')
    let data: AppData = { ...emptyData(), cards: [nubank, late] }
    data.purchases = [
      { id: 'a', platform: 'Amazon', product: 'TV', total: 3000, date: '2026-10-05', method: 'Crédito', installments: 10, cardId: 'nu', status: 'entregue', categoryId: 'compras' },
      { id: 'b', platform: 'Shopee', product: 'Fone', total: 200, date: '2026-10-01', method: 'Crédito', installments: 1, cardId: 'nu', status: 'entregue', categoryId: 'lazer' },
      { id: 'c', platform: 'Loja', product: 'Tênis', total: 400, date: '2026-09-20', method: 'Crédito', installments: 2, cardId: 'it', status: 'entregue' },
    ]
    data = regenerateAll(data)
    const oct = cardSpending(data, '2026-10')
    expect(oct.total).toBe(3200)
    expect(cardSpending(data, '2026-10', 'nu').byCategory[0]).toEqual({ id: 'compras', value: 3000 })
    expect(cardSpending(data, '2026-09', 'it').total).toBe(400)
    const b = limitBreakdown(data, nubank)
    // fatura aberta out/26 tem o fone (200); TV começa em nov
    expect(b.currentOpen).toBe(200)
    expect(b.future).toBe(3000)
    expect(b.closed).toBe(0)
    expect(b.used).toBe(3200)
    // Itaú: compra 20/09 (antes do fechamento 25) → fatura out (vence 05/10), parcela 2 em nov
    const bi = limitBreakdown(data, late)
    expect(bi.openInvoice).toBe('2026-11')
    expect(bi.closed).toBe(200)
    expect(bi.currentOpen).toBe(200)
  })
})
