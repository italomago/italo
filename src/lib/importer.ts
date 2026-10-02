// Importação de cadastros colados como texto (ex.: financiamentos preparados a partir de contratos).
// Diferente da restauração de backup, aqui nada é apagado: os itens são ADICIONADOS aos dados atuais.
import type { AmortSystem } from './finance'
import type { Financing } from './types'

export interface ImportPayload {
  financings: Omit<Financing, 'id' | 'accountId'>[]
  /** Despesas fixas que passam a ser controladas como financiamento (removidas para não contar duas vezes). */
  removeRecurrences: string[]
}

const TYPES: Financing['type'][] = ['veiculo', 'imovel', 'equipamento', 'emprestimo', 'outros']
const SYSTEMS: AmortSystem[] = ['PRICE', 'SAC', 'DESCONHECIDO']

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')
const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)

export function parseImport(text: string): ImportPayload {
  let raw: unknown
  try {
    raw = JSON.parse(text.trim())
  } catch {
    throw new Error('Texto inválido. Copie o texto inteiro, do primeiro { até o último }.')
  }
  const obj = raw as Record<string, unknown>
  if (!obj || obj.app !== 'minhas-financas-importar') throw new Error('Este texto não é um cadastro para importar.')
  const list = Array.isArray(obj.financings) ? obj.financings : []
  const financings = list.map((f: Record<string, unknown>, i: number) => {
    const name = str(f.name)
    const n = num(f.n)
    if (!name || !n || n < 1 || !isDate(f.firstDate)) throw new Error(`Financiamento ${i + 1} incompleto (nome, parcelas e 1ª parcela são obrigatórios).`)
    return {
      name,
      institution: str(f.institution),
      type: TYPES.includes(f.type as Financing['type']) ? (f.type as Financing['type']) : 'outros',
      asset: str(f.asset),
      assetValue: num(f.assetValue),
      downPayment: num(f.downPayment),
      financedValue: num(f.financedValue),
      monthlyRate: num(f.monthlyRate),
      annualRate: num(f.annualRate),
      n: Math.round(n),
      installment: num(f.installment),
      monthlyFees: num(f.monthlyFees),
      firstDate: f.firstDate,
      paidCount: Math.max(0, Math.round(num(f.paidCount) ?? 0)),
      balanceInformed: num(f.balanceInformed),
      system: SYSTEMS.includes(f.system as AmortSystem) ? (f.system as AmortSystem) : 'DESCONHECIDO',
      note: str(f.note) || undefined,
    }
  })
  const removeRecurrences = Array.isArray(obj.removeRecurrences) ? obj.removeRecurrences.map(str).filter(Boolean) : []
  if (!financings.length && !removeRecurrences.length) throw new Error('Não há nada para importar neste texto.')
  return { financings, removeRecurrences }
}

export const sameName = (a: string, b: string) =>
  a.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '') ===
  b.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
