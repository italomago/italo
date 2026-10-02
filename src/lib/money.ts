// Utilitários monetários. Valores são números em reais, sempre arredondados a centavos.

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const num = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function fmtBRL(n: number): string {
  // evita "-R$ 0,00"
  const v = Math.abs(n) < 0.005 ? 0 : n
  return brl.format(v).replace(/ /g, ' ')
}
export function fmtNum(n: number): string {
  return num.format(n)
}
export function fmtPct(n: number, digits = 1): string {
  return `${(n * 100).toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`
}
/** Formato compacto para eixos de gráficos: 1,2 mil / 3,4 mi */
export function fmtCompact(n: number): string {
  const a = Math.abs(n)
  if (a >= 1e6) return `${(n / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`
  if (a >= 1e3) return `${(n / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
}

/**
 * Lê valores digitados no padrão brasileiro: "1.200", "1.200,50", "R$ 80.000", "1200.5", "12,5".
 */
export function parseMoney(input: string): number | null {
  let s = input.replace(/[R$\s]/gi, '').trim()
  if (!s) return null
  let mult = 1
  const suf = s.match(/(mil|k)$/i)
  if (suf) {
    mult = 1000
    s = s.slice(0, -suf[1].length)
  }
  const hasComma = s.includes(',')
  const dots = (s.match(/\./g) || []).length
  if (hasComma) {
    s = s.replace(/\./g, '').replace(',', '.')
  } else if (dots > 1 || /^\d{1,3}(\.\d{3})+$/.test(s)) {
    // "1.200" ou "1.200.000" → separador de milhar
    s = s.replace(/\./g, '')
  }
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null
  const v = Number(s) * mult
  return Number.isFinite(v) ? round2(v) : null
}

/**
 * Divide um total em N parcelas com centavos exatos.
 * A diferença de arredondamento fica na primeira parcela (prática comum no varejo).
 */
export function splitInstallments(total: number, n: number): number[] {
  if (n <= 1) return [round2(total)]
  const cents = Math.round(total * 100)
  const base = Math.floor(cents / n)
  const rest = cents - base * n
  return Array.from({ length: n }, (_, i) => (i === 0 ? base + rest : base) / 100)
}

export function sum(values: number[]): number {
  return round2(values.reduce((a, b) => a + b, 0))
}
