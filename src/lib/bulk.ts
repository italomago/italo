// Cadastro de várias despesas fixas de uma vez, a partir de uma lista colada (uma por linha).
// Formatos aceitos em cada linha:
//   "Casa; 2.061,30; 10"        (nome; valor; dia)
//   "Gazin 175 todo dia 15"     (texto livre)
//   "Energia"                    (só o nome — valor fica para depois)
import { parseMoney } from './money'

export interface BulkItem {
  name: string
  amount: number // 0 = valor a definir
  day?: number
  categoryId: string
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')

const HINTS: [RegExp, string][] = [
  [/\b(cartao|fatura)\b/, 'dividas'],
  [/\b(linha de credito|emprestimo|financiamento|consorcio|pronampe|proampe|acordo|protesto|mercado pago)\b/, 'dividas'],
  [/\b(carro|moto|veiculo|ipva|seguro auto)\b/, 'veiculo'],
  [/\b(energia|luz|agua|aluguel|condominio|casa|gas|iptu)\b/, 'casa'],
  [/\b(internet|net|starlink|stralink|celular|telefone|claro|vivo|tim|oi|netflix|spotify|streaming)\b/, 'assinaturas'],
  [/\b(farmacia|remedio|plano de saude|academia)\b/, 'saude'],
  [/\b(escola|faculdade|curso)\b/, 'educacao'],
  [/\b(imposto|das|inss|irpf|taxa)\b/, 'impostos'],
  [/\b(contador|contabilidade|diarista|servico)\b/, 'servicos'],
  [/\b(havan|gazin|avenida|magazine|casas bahia|crediario|loja)\b/, 'compras'],
  [/\b(mercado|supermercado)\b/, 'mercado'],
]

export function guessCategory(name: string): string {
  const n = norm(name)
  return HINTS.find(([re]) => re.test(n))?.[1] ?? 'outros-out'
}

/** Arruma maiúsculas palavra por palavra: "CARRO" → "Carro", "energia" → "Energia"; mantém siglas e nomes já escritos ("JBS", "Sicredi"). */
function tidyName(s: string): string {
  return s
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((w, i) => {
      const lower = w.toLowerCase()
      if (i > 0 && /^(de|da|do|das|dos|e)$/.test(lower)) return lower
      if (w === lower || (w === w.toUpperCase() && w.length > 4)) return lower.charAt(0).toUpperCase() + lower.slice(1)
      return w
    })
    .join(' ')
}

export function parseBulkLine(line: string): BulkItem | null {
  let text = line.replace(/^\s*[-*•\d]+[.)]\s+/, '').trim()
  if (!text) return null
  let amount = 0
  let day: number | undefined

  if (text.includes(';')) {
    const [name, value, d] = text.split(';').map((p) => p.trim())
    amount = (value && parseMoney(value)) || 0
    const dn = d ? Number(d.replace(/\D/g, '')) : NaN
    if (dn >= 1 && dn <= 31) day = dn
    text = name
  } else {
    const dm = text.match(/(?:todo\s+)?dia\s*(\d{1,2})/i)
    if (dm) {
      const dn = Number(dm[1])
      if (dn >= 1 && dn <= 31) day = dn
      text = text.replace(dm[0], ' ')
    }
    // valor: com R$ ou um número solto (aceita "r$1400", "R$ 2.061,30", "175")
    const mm = text.match(/r\$\s*([\d.,]+)/i) ?? text.match(/(?:^|\s)(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:,\d{1,2})?)(?=\s|$)/)
    if (mm) {
      amount = parseMoney(mm[1]) ?? 0
      text = text.replace(mm[0], ' ')
    }
    text = text.replace(/r\$\s*$/i, ' ')
  }
  const name = tidyName(text.replace(/[;:—–-]+\s*$/, ''))
  if (!name) return null
  return { name, amount, day, categoryId: guessCategory(name) }
}

export function parseBulk(text: string): BulkItem[] {
  return text
    .split(/\r?\n/)
    .map(parseBulkLine)
    .filter((x): x is BulkItem => x != null)
}
