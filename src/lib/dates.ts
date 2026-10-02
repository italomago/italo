// Datas são sempre strings ISO locais "AAAA-MM-DD" para evitar problemas de fuso horário.

export type ISODate = string

const pad = (n: number) => String(n).padStart(2, '0')

export function toISO(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function parseISO(s: ISODate): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

let fixedToday: ISODate | null = null
/** Permite fixar "hoje" em testes. */
export function setToday(d: ISODate | null) {
  fixedToday = d
}
export function today(): ISODate {
  return fixedToday ?? toISO(new Date())
}

export function daysInMonth(year: number, month1: number): number {
  return new Date(year, month1, 0).getDate()
}

/** Cria data com o dia limitado ao último dia do mês (ex.: dia 31 em fevereiro → 28/29). */
export function makeDate(year: number, month1: number, day: number): ISODate {
  // normaliza mês fora do intervalo
  const y = year + Math.floor((month1 - 1) / 12)
  const m = ((((month1 - 1) % 12) + 12) % 12) + 1
  const dd = Math.min(day, daysInMonth(y, m))
  return `${y}-${pad(m)}-${pad(dd)}`
}

export function ymd(s: ISODate): [number, number, number] {
  const [y, m, d] = s.split('-').map(Number)
  return [y, m, d]
}

/** Soma meses mantendo o dia "âncora" (com limite no fim do mês). */
export function addMonths(s: ISODate, n: number, anchorDay?: number): ISODate {
  const [y, m, d] = ymd(s)
  return makeDate(y, m + n, anchorDay ?? d)
}

export function addDays(s: ISODate, n: number): ISODate {
  const d = parseISO(s)
  d.setDate(d.getDate() + n)
  return toISO(d)
}

export function diffDays(a: ISODate, b: ISODate): number {
  // b - a em dias
  const ms = Date.UTC(...utcParts(b)) - Date.UTC(...utcParts(a))
  return Math.round(ms / 86400000)
}
function utcParts(s: ISODate): [number, number, number] {
  const [y, m, d] = ymd(s)
  return [y, m - 1, d]
}

/** Diferença em meses de calendário entre dois "AAAA-MM". */
export function monthDiff(a: string, b: string): number {
  const [ya, ma] = a.split('-').map(Number)
  const [yb, mb] = b.split('-').map(Number)
  return (yb - ya) * 12 + (mb - ma)
}

export function monthKey(s: ISODate): string {
  return s.slice(0, 7)
}

export function addMonthKey(key: string, n: number): string {
  return makeDate(Number(key.slice(0, 4)), Number(key.slice(5, 7)) + n, 1).slice(0, 7)
}

export function startOfMonth(s: ISODate): ISODate {
  return s.slice(0, 7) + '-01'
}
export function endOfMonth(s: ISODate): ISODate {
  const [y, m] = ymd(s)
  return makeDate(y, m, 31)
}
export function startOfWeek(s: ISODate): ISODate {
  const d = parseISO(s)
  const dow = (d.getDay() + 6) % 7 // segunda = 0
  return addDays(s, -dow)
}

const MONTHS = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]
const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

export function monthName(key: string, short = false): string {
  const m = Number(key.slice(5, 7)) - 1
  return short ? MONTHS_SHORT[m] : MONTHS[m]
}
export function monthLabel(key: string, short = false): string {
  const name = monthName(key, short)
  const y = key.slice(0, 4)
  return short ? `${name}/${y.slice(2)}` : `${name.charAt(0).toUpperCase()}${name.slice(1)} de ${y}`
}

export function fmtDate(s: ISODate | undefined | null): string {
  if (!s) return '—'
  const [y, m, d] = ymd(s)
  return `${pad(d)}/${pad(m)}/${y}`
}
export function fmtDateShort(s: ISODate): string {
  const [, m, d] = ymd(s)
  return `${pad(d)}/${pad(m)}`
}

/** Converte "10/10/2026", "10/10/26" ou "10/10" (ano atual) para ISO. */
export function parseBRDate(s: string, ref: ISODate = today()): ISODate | null {
  const m = s.trim().match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/)
  if (!m) return null
  const d = Number(m[1])
  const mo = Number(m[2])
  let y = m[3] ? Number(m[3]) : Number(ref.slice(0, 4))
  if (y < 100) y += 2000
  if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) return null
  return `${y}-${pad(mo)}-${pad(d)}`
}
