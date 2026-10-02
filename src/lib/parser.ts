// Interpreta lançamentos rápidos digitados em linguagem natural, ex.:
//   "Mercado Livre — R$ 1.200 — 10x cartão"
//   "Financiamento Duster — R$ 80.000 — 48x — primeira parcela 10/10/2026"
//   "Salário 5.000 todo dia 5"
import { parseBRDate, today, type ISODate } from './dates'
import { parseMoney } from './money'
import type { Card } from './types'

export type QuickType = 'entrada' | 'saida' | 'compra' | 'financiamento' | 'divida' | 'meta' | 'transferencia'

export interface ParsedEntry {
  type: QuickType
  amount?: number
  installments?: number
  date?: ISODate
  method?: string
  cardId?: string
  platform?: string
  categoryId?: string
  origin?: string
  recurringDay?: number
  description: string
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')

const PLATFORMS: [RegExp, string][] = [
  [/mercado\s*livre|\bml\b/, 'Mercado Livre'],
  [/amazon/, 'Amazon'],
  [/shopee/, 'Shopee'],
  [/magazine\s*luiza|magalu/, 'Magazine Luiza'],
  [/aliexpress/, 'AliExpress'],
  [/shein/, 'Shein'],
  [/americanas/, 'Americanas'],
  [/casas\s*bahia/, 'Casas Bahia'],
]

const METHODS: [RegExp, string][] = [
  [/\b(cartao|credito|cc)\b/, 'Crédito'],
  [/\bdebito\b/, 'Débito'],
  [/\bpix\b/, 'Pix'],
  [/\b(dinheiro|especie)\b/, 'Dinheiro'],
  [/\bboleto\b/, 'Boleto'],
  [/\b(transferencia|ted|doc)\b/, 'Transferência'],
]

const CATEGORY_HINTS: [RegExp, string][] = [
  [/\b(supermercado|mercado|feira|acougue|hortifruti|atacadao|assai)\b/, 'mercado'],
  [/\b(gasolina|etanol|alcool|diesel|posto|combustivel|abastec)/, 'combustivel'],
  [/\b(uber|99|estacionamento|pedagio|oficina|mecanico|pneu|ipva|lavagem|carro|moto)\b/, 'veiculo'],
  [/\b(ifood|restaurante|lanche|pizza|almoco|jantar|padaria|cafe|delivery|hamburguer)\b/, 'alimentacao'],
  [/\b(netflix|spotify|disney|prime video|hbo|max|youtube|assinatura|icloud|globoplay)\b/, 'assinaturas'],
  [/\b(farmacia|remedio|medico|consulta|exame|dentista|academia|plano de saude|hospital)\b/, 'saude'],
  [/\b(aluguel|condominio|energia|luz|agua|gas|internet|iptu)\b/, 'casa'],
  [/\b(escola|faculdade|curso|livro|mensalidade)\b/, 'educacao'],
  [/\b(cinema|show|bar|balada|viagem|passeio)\b/, 'lazer'],
  [/\b(hotel|passagem|pousada|airbnb)\b/, 'viagens'],
  [/\b(roupa|tenis|sapato|celular|notebook|eletronico|presente)\b/, 'compras'],
]

const INCOME_HINTS: [RegExp, string][] = [
  [/\bsalario\b/, 'Salário'],
  [/\bcomiss(ao|oes)\b/, 'Comissão'],
  [/\bpremi(o|acao)\b/, 'Premiação'],
  [/\b(vendi|venda)\b/, 'Venda'],
  [/\b(extra|freela|freelance|bico)\b/, 'Trabalho extra'],
  [/\bpix recebido\b/, 'Pix recebido'],
  [/\b(recebi|recebimento|entrada|reembolso|rendimento|dividendo)/, 'Outros'],
]

export function parseQuick(input: string, cards: Card[] = [], ref: ISODate = today()): ParsedEntry {
  let text = ` ${input} `
  const n = norm(text)
  const out: ParsedEntry = { type: 'saida', description: '' }
  const cut = (re: RegExp) => {
    text = text.replace(re, ' ')
  }

  // data (primeira parcela, vencimento etc.)
  for (const dm of text.matchAll(/(?:primeira parcela|1a parcela|vencimento|venc\.?|em|dia)?\s*(?<![\d.,])(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)(?![\d/])/gi)) {
    const d = parseBRDate(dm[1], ref)
    if (d) {
      out.date = d
      text = text.replace(dm[0], ' ')
      break
    }
  }

  // recorrência: "todo dia 5", "todo mês dia 10"
  const rm = norm(text).match(/todo(?:s os)?\s+(?:mes\s+)?dias?\s+(\d{1,2})/)
  if (rm) {
    out.recurringDay = Math.min(31, Math.max(1, Number(rm[1])))
    cut(/tod[oa]s?\s+(os\s+)?(m[eê]s\s+)?dias?\s+\d{1,2}/i)
  } else if (/\b(mensal|todo mes|por mes)\b/.test(norm(text))) {
    out.recurringDay = Number(ref.slice(8, 10))
    cut(/\b(mensal|todo m[eê]s|por m[eê]s)\b/i)
  }

  // parcelas: "10x", "em 10 vezes", "10 parcelas"
  const im = norm(text).match(/\b(\d{1,3})\s*(?:x\b|vezes|parcelas)/)
  if (im) {
    out.installments = Number(im[1])
    cut(/\b(em\s+)?\d{1,3}\s*(x\b|vezes|parcelas)/i)
  }

  // valor: prioriza o que vem com R$
  const moneyRe = /R\$\s*([\d.,]+(?:\s*(?:mil|k))?)/i
  const mm = text.match(moneyRe)
  if (mm) {
    out.amount = parseMoney(mm[1]) ?? undefined
    cut(moneyRe)
  } else {
    const nums = [...text.matchAll(/(?<![\w/])(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)(\s*(?:mil|k)\b)?(?![\w/])/gi)]
    let best: { v: number; raw: string } | null = null
    for (const m of nums) {
      const v = parseMoney(m[0])
      if (v != null && (!best || v > best.v)) best = { v, raw: m[0] }
    }
    if (best) {
      out.amount = best.v
      text = text.replace(best.raw, ' ')
    }
  }

  // forma de pagamento
  for (const [re, m] of METHODS) {
    if (re.test(norm(text))) {
      out.method = m
      break
    }
  }
  // cartão cadastrado pelo nome
  for (const c of cards) {
    const cn = norm(c.name)
    if (cn && norm(text).includes(cn)) {
      out.cardId = c.id
      out.method = 'Crédito'
      break
    }
  }
  if (out.method === 'Crédito' && !out.cardId && cards.length === 1) out.cardId = cards[0].id

  // tipo
  const nt = norm(text)
  if (/\b(financiamento|financiei|financiado)\b/.test(n)) {
    out.type = 'financiamento'
    cut(/\b(financiamento|financiei|financiado)\b/i)
  } else if (/\b(divida|emprestimo|acordo|consignado)\b/.test(n)) {
    out.type = 'divida'
  } else if (/\b(meta|objetivo|juntar|guardar para)\b/.test(n)) {
    out.type = 'meta'
    cut(/\b(meta|objetivo)\b:?/i)
  } else if (/\b(transferi|transferencia entre contas)\b/.test(n)) {
    out.type = 'transferencia'
  } else {
    const inc = INCOME_HINTS.find(([re]) => re.test(nt))
    if (inc) {
      out.type = 'entrada'
      out.origin = inc[1]
      out.categoryId = inc[1] === 'Salário' ? 'salario' : 'renda-extra'
      cut(/\b(recebi|recebimento)\b/i)
    } else {
      const plat = PLATFORMS.find(([re]) => re.test(nt))
      if (plat) {
        out.type = 'compra'
        out.platform = plat[1]
        cut(new RegExp(plat[0].source.replace(/\\b/g, ''), 'i'))
      } else if (out.installments && out.installments > 1) {
        out.type = 'compra'
      }
      // procura a categoria no texto já sem o nome da plataforma ("Mercado Livre" não é "mercado")
      const rest = norm(text)
      const cat = CATEGORY_HINTS.find(([re]) => re.test(rest))
      if (cat) out.categoryId = cat[1]
      else if (out.type === 'compra') out.categoryId = 'compras'
    }
  }

  // remove palavras de forma de pagamento da descrição
  for (const [re] of METHODS) {
    const src = re.source.replace(/\\b/g, '')
    text = text.replace(new RegExp(`\\b(no |com |via |de )?(${src})\\b`, 'gi'), ' ')
  }
  text = text.replace(/\b(cart[aã]o|cr[eé]dito|d[eé]bito|transfer[eê]ncia|esp[eé]cie)\b/gi, ' ')
  const desc = text
    .replace(/[—–|;]+/g, ' ')
    .replace(/\s-\s/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,.-]+|[\s,.-]+$/g, '')
    .trim()
  out.description = desc ? desc.charAt(0).toUpperCase() + desc.slice(1) : (out.platform ?? '')
  return out
}
