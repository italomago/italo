// Matemática financeira: Tabela Price, SAC, taxas, cronograma e simulações de antecipação.
import { addMonths, type ISODate } from './dates'
import { round2 } from './money'

export type AmortSystem = 'PRICE' | 'SAC' | 'DESCONHECIDO'

/** Taxa anual efetiva → mensal equivalente. */
export function annualToMonthly(a: number): number {
  return Math.pow(1 + a, 1 / 12) - 1
}
/** Taxa mensal → anual efetiva equivalente. */
export function monthlyToAnnual(m: number): number {
  return Math.pow(1 + m, 12) - 1
}

/** Prestação da Tabela Price. */
export function pmt(principal: number, rate: number, n: number): number {
  if (n <= 0) return 0
  if (rate === 0) return principal / n
  return (principal * rate) / (1 - Math.pow(1 + rate, -n))
}

/** Valor presente de uma série de N prestações iguais. */
export function presentValue(payment: number, rate: number, n: number): number {
  if (rate === 0) return payment * n
  return (payment * (1 - Math.pow(1 + rate, -n))) / rate
}

/** Descobre a taxa mensal da Tabela Price a partir do valor financiado, parcela e prazo. */
export function solveRate(principal: number, payment: number, n: number): number {
  if (principal <= 0 || payment <= 0 || n <= 0) return 0
  if (payment * n <= principal + 1e-9) return 0
  let lo = 0
  let hi = 1
  while (pmt(principal, hi, n) < payment && hi < 100) hi *= 2
  for (let it = 0; it < 200; it++) {
    const mid = (lo + hi) / 2
    if (pmt(principal, mid, n) > payment) hi = mid
    else lo = mid
  }
  return (lo + hi) / 2
}

/** Número de meses para quitar um saldo com prestação fixa (Price). Infinity se a parcela não cobre os juros. */
export function monthsToPayoff(balance: number, rate: number, payment: number): number {
  if (balance <= 0) return 0
  if (rate === 0) return Math.ceil(balance / payment - 1e-9)
  if (payment <= balance * rate) return Infinity
  return Math.ceil(-Math.log(1 - (balance * rate) / payment) / Math.log(1 + rate) - 1e-9)
}

export interface ScheduleRow {
  k: number // número da parcela (1..n)
  date: ISODate
  payment: number // parcela total (amortização + juros + encargos)
  interest: number
  amortization: number
  fees: number // seguros/taxas fixas embutidas na parcela
  balance: number // saldo devedor após o pagamento
}

export interface FinancingInput {
  assetValue?: number
  downPayment?: number
  financedValue?: number
  monthlyRate?: number // decimal (0,0199 = 1,99% a.m.)
  annualRate?: number // decimal
  n: number
  installment?: number // valor da parcela informado (Price: fixa; SAC: primeira)
  firstDate: ISODate
  paidCount?: number
  system?: AmortSystem
  balanceInformed?: number // saldo devedor informado pela instituição
  monthlyFees?: number // seguros e taxas fixas cobrados junto com a parcela
}

export interface ResolvedFinancing {
  principal: number
  rate: number // mensal
  annualRate: number
  n: number
  system: 'PRICE' | 'SAC'
  corePayment: number // Price: parcela sem encargos. SAC: primeira parcela sem encargos
  amortization: number // SAC: amortização constante
  fees: number
  rateEstimated: boolean
  systemAssumed: boolean
  warnings: string[]
}

export function resolveFinancing(f: FinancingInput): ResolvedFinancing {
  const warnings: string[] = []
  const n = Math.max(1, Math.round(f.n))
  let principal = f.financedValue ?? 0
  if (!principal && f.assetValue) principal = f.assetValue - (f.downPayment ?? 0)
  if (!principal && f.installment) principal = f.installment * n
  principal = Math.max(0, principal)

  const systemAssumed = !f.system || f.system === 'DESCONHECIDO'
  const system: 'PRICE' | 'SAC' = f.system === 'SAC' ? 'SAC' : 'PRICE'
  if (systemAssumed) warnings.push('Sistema de amortização não informado: cálculo feito pela Tabela Price (o mais comum).')

  let rate: number | undefined =
    f.monthlyRate != null && f.monthlyRate > 0
      ? f.monthlyRate
      : f.annualRate != null && f.annualRate > 0
        ? annualToMonthly(f.annualRate)
        : undefined
  let rateEstimated = false

  const explicitFees = f.monthlyFees != null && f.monthlyFees > 0 ? f.monthlyFees : 0
  if (rate == null) {
    rateEstimated = true
    const core = (f.installment ?? 0) - explicitFees
    if (core > 0) {
      if (system === 'PRICE') rate = solveRate(principal, core, n)
      else rate = Math.max(0, (core - principal / n) / principal)
      warnings.push('Taxa de juros não informada: estimada a partir do valor da parcela (pode incluir seguros e tarifas).')
    } else {
      rate = 0
      warnings.push('Sem taxa de juros e sem valor de parcela: cálculo sem juros. Informe os dados do contrato para maior precisão.')
    }
  }

  let corePayment: number
  let amortization = 0
  let fees = explicitFees
  if (system === 'PRICE') {
    corePayment = pmt(principal, rate, n)
    if (f.installment && f.installment > 0 && !rateEstimated && !explicitFees) {
      const diff = f.installment - corePayment
      if (diff > 0.05) {
        fees = diff
        warnings.push(
          `A parcela informada é ${round2(diff).toFixed(2).replace('.', ',')} maior que a calculada pela taxa: a diferença foi tratada como seguros/tarifas mensais.`,
        )
      } else if (diff < -0.05) {
        warnings.push('A parcela informada é menor que a calculada pela taxa. Confira a taxa e o valor financiado com a instituição.')
        corePayment = f.installment
      }
    }
  } else {
    amortization = principal / n
    corePayment = amortization + principal * rate
    if (f.installment && f.installment > 0 && !rateEstimated && !explicitFees) {
      const diff = f.installment - corePayment
      if (diff > 0.05) {
        fees = diff
        warnings.push('A primeira parcela informada é maior que a calculada: a diferença foi tratada como seguros/tarifas mensais.')
      }
    }
  }

  return {
    principal: round2(principal),
    rate,
    annualRate: monthlyToAnnual(rate),
    n,
    system,
    corePayment,
    amortization,
    fees,
    rateEstimated,
    systemAssumed,
    warnings,
  }
}

/** Cronograma completo, mês a mês. A última parcela é ajustada para zerar o saldo. */
export function buildSchedule(r: ResolvedFinancing, firstDate: ISODate, anchorDay?: number): ScheduleRow[] {
  const rows: ScheduleRow[] = []
  const anchor = anchorDay ?? Number(firstDate.slice(8, 10))
  // Valores em centavos a cada mês, como nos carnês: amortização arredondada é a que abate o saldo.
  let balance = round2(r.principal)
  const fees = round2(r.fees)
  for (let k = 1; k <= r.n; k++) {
    const interest = round2(balance * r.rate)
    let amort = round2(r.system === 'PRICE' ? r.corePayment - interest : r.amortization)
    if (k === r.n || amort > balance) amort = balance
    balance = round2(balance - amort)
    rows.push({
      k,
      date: addMonths(firstDate, k - 1, anchor),
      payment: round2(amort + interest + fees),
      interest,
      amortization: amort,
      fees,
      balance: Math.max(0, balance),
    })
  }
  return rows
}

export interface FinancingSummary {
  resolved: ResolvedFinancing
  schedule: ScheduleRow[]
  paidCount: number
  remainingCount: number
  totalPaid: number
  totalRemaining: number
  totalInterest: number
  interestPaid: number
  interestRemaining: number
  balance: number // saldo devedor atual (informado ou calculado)
  balanceSource: 'informado' | 'calculado'
  payoffDate: ISODate | null
  nextInstallment: ScheduleRow | null
  pctPaid: number
  pctRemaining: number
  totalCost: number // soma de todas as parcelas
}

export function summarizeFinancing(f: FinancingInput): FinancingSummary {
  const resolved = resolveFinancing(f)
  let schedule = buildSchedule(resolved, f.firstDate)
  const paidCount = Math.min(Math.max(0, Math.round(f.paidCount ?? 0)), schedule.length)
  const informed = f.balanceInformed != null && f.balanceInformed > 0
  if (informed && paidCount < schedule.length) {
    // Parcelas futuras recalculadas a partir do saldo devedor informado pelo banco
    // (contratos corrigidos por IPCA/TR, renegociações etc.).
    const remaining = schedule.length - paidCount
    const B = f.balanceInformed!
    const rebased = buildSchedule(
      {
        ...resolved,
        principal: B,
        n: remaining,
        corePayment: resolved.system === 'PRICE' ? pmt(B, resolved.rate, remaining) : B / remaining + B * resolved.rate,
        amortization: B / remaining,
      },
      schedule[paidCount].date,
      Number(f.firstDate.slice(8, 10)),
    ).map((r) => ({ ...r, k: r.k + paidCount }))
    schedule = [...schedule.slice(0, paidCount), ...rebased]
  }
  const paid = schedule.slice(0, paidCount)
  const rest = schedule.slice(paidCount)
  const sumOf = (rows: ScheduleRow[], key: 'payment' | 'interest') => round2(rows.reduce((a, r) => a + r[key], 0))
  const totalPaid = sumOf(paid, 'payment')
  const totalRemaining = sumOf(rest, 'payment')
  const totalCost = round2(totalPaid + totalRemaining)
  const calcBalance = paidCount === 0 ? resolved.principal : schedule[paidCount - 1].balance
  return {
    resolved,
    schedule,
    paidCount,
    remainingCount: rest.length,
    totalPaid,
    totalRemaining,
    totalInterest: sumOf(schedule, 'interest'),
    interestPaid: sumOf(paid, 'interest'),
    interestRemaining: sumOf(rest, 'interest'),
    balance: informed ? round2(f.balanceInformed!) : calcBalance,
    balanceSource: informed ? 'informado' : 'calculado',
    payoffDate: rest.length ? rest[rest.length - 1].date : null,
    nextInstallment: rest[0] ?? null,
    pctPaid: totalCost > 0 ? totalPaid / totalCost : 0,
    pctRemaining: totalCost > 0 ? totalRemaining / totalCost : 0,
    totalCost,
  }
}

// ---------------------------------------------------------------------------
// Simulações
// ---------------------------------------------------------------------------

export interface LoanState {
  balance: number
  rate: number
  remaining: number // parcelas restantes
  system: 'PRICE' | 'SAC'
  /** Price: parcela sem encargos. SAC: ignorado (usa amortização). */
  payment: number
  /** SAC: amortização mensal constante. */
  amortization: number
  nextDate: ISODate // data da próxima parcela
}

/** Estado atual do contrato para simulações. Se o saldo foi informado pela instituição, recalcula a parcela de forma coerente. */
export function loanStateFrom(s: FinancingSummary): LoanState {
  const r = s.resolved
  const remaining = s.remainingCount
  let payment = r.corePayment
  let amortization = r.amortization
  if (s.balanceSource === 'informado' && remaining > 0) {
    if (r.system === 'PRICE') payment = pmt(s.balance, r.rate, remaining)
    else amortization = s.balance / remaining
  }
  return {
    balance: s.balance,
    rate: r.rate,
    remaining,
    system: r.system,
    payment,
    amortization,
    nextDate: s.nextInstallment?.date ?? s.schedule[s.schedule.length - 1]?.date,
  }
}

export interface PayoffResult {
  months: number
  totalPaid: number
  totalInterest: number
  endDate: ISODate | null
  neverEnds: boolean
}

/** Simula a quitação mês a mês, opcionalmente com pagamento extra mensal. */
export function runPayoff(st: LoanState, extraMonthly = 0, maxMonths = 1200): PayoffResult {
  let balance = st.balance
  let months = 0
  let totalPaid = 0
  let totalInterest = 0
  const anchor = Number(st.nextDate.slice(8, 10))
  while (balance > 0.005 && months < maxMonths) {
    const interest = balance * st.rate
    const base = st.system === 'PRICE' ? st.payment : st.amortization + interest
    let pay = base + extraMonthly
    if (pay - interest >= balance - 0.005) pay = balance + interest
    if (pay <= interest) {
      return { months: Infinity, totalPaid, totalInterest, endDate: null, neverEnds: true }
    }
    balance = balance - (pay - interest)
    totalPaid += pay
    totalInterest += interest
    months++
  }
  return {
    months,
    totalPaid: round2(totalPaid),
    totalInterest: round2(totalInterest),
    endDate: months > 0 ? addMonths(st.nextDate, months - 1, anchor) : null,
    neverEnds: balance > 0.005,
  }
}

/** Parcelas futuras (sem encargos) a partir do estado atual. */
export function futurePayments(st: LoanState): number[] {
  const out: number[] = []
  let balance = st.balance
  for (let j = 1; j <= st.remaining; j++) {
    const interest = balance * st.rate
    let amort = st.system === 'PRICE' ? st.payment - interest : st.amortization
    if (j === st.remaining || amort > balance) amort = balance
    out.push(amort + interest)
    balance -= amort
  }
  return out
}

export interface AnticipationResult {
  count: number // parcelas antecipadas (de trás para frente)
  amountUsed: number // valor efetivamente pago (valor presente)
  nominal: number // soma do valor cheio dessas parcelas
  interestSaved: number
  leftover: number // sobra do valor disponível
  newRemaining: number
  newPayoffDate: ISODate | null
  balanceReduction: number
  monthsSaved: number
}

/**
 * Antecipação das ÚLTIMAS parcelas com desconto dos juros (direito do consumidor, art. 52 §2º do CDC).
 * Cada parcela futura vale hoje: parcela / (1 + i)^j, onde j é o número de meses até seu vencimento.
 */
export function anticipateLast(st: LoanState, available: number): AnticipationResult {
  const pays = futurePayments(st)
  let used = 0
  let nominal = 0
  let count = 0
  for (let j = pays.length; j >= 1; j--) {
    const pv = pays[j - 1] / Math.pow(1 + st.rate, j)
    if (used + pv > available + 0.005) break
    used += pv
    nominal += pays[j - 1]
    count++
  }
  const newRemaining = pays.length - count
  const anchor = Number(st.nextDate.slice(8, 10))
  return {
    count,
    amountUsed: round2(used),
    nominal: round2(nominal),
    interestSaved: round2(nominal - used),
    leftover: round2(available - used),
    newRemaining,
    newPayoffDate: newRemaining > 0 ? addMonths(st.nextDate, newRemaining - 1, anchor) : null,
    balanceReduction: round2(used),
    monthsSaved: count,
  }
}

export interface ExtraPaymentResult {
  base: PayoffResult
  // opção 1: reduzir prazo (mantém parcela)
  reducedTerm: PayoffResult
  monthsSaved: number
  interestSavedTerm: number
  // opção 2: reduzir parcela (mantém prazo)
  newPayment: number
  interestSavedPayment: number
  newBalance: number
}

/** Pagamento extraordinário único, aplicado hoje ao saldo devedor. */
export function extraordinaryPayment(st: LoanState, amount: number): ExtraPaymentResult {
  const base = runPayoff(st)
  const newBalance = Math.max(0, st.balance - amount)
  const reducedTerm = runPayoff({ ...st, balance: newBalance })
  let newPayment: number
  let totalNewPayment: number
  if (st.system === 'PRICE') {
    newPayment = pmt(newBalance, st.rate, st.remaining)
    totalNewPayment = newPayment * st.remaining
  } else {
    const amort = newBalance / Math.max(1, st.remaining)
    newPayment = amort + newBalance * st.rate
    totalNewPayment = futurePayments({ ...st, balance: newBalance, amortization: amort }).reduce((a, b) => a + b, 0)
  }
  const interestAfterPayment = totalNewPayment - newBalance
  return {
    base,
    reducedTerm,
    monthsSaved: base.months - reducedTerm.months,
    interestSavedTerm: round2(base.totalInterest - reducedTerm.totalInterest),
    newPayment: round2(newPayment),
    interestSavedPayment: round2(base.totalInterest - interestAfterPayment),
    newBalance: round2(newBalance),
  }
}

export interface ExtraMonthlyResult {
  base: PayoffResult
  withExtra: PayoffResult
  monthsSaved: number
  interestSaved: number
}

/** Pagar R$ X por mês além da parcela normal. */
export function extraMonthly(st: LoanState, extra: number): ExtraMonthlyResult {
  const base = runPayoff(st)
  const withExtra = runPayoff(st, extra)
  return {
    base,
    withExtra,
    monthsSaved: base.months - withExtra.months,
    interestSaved: round2(base.totalInterest - withExtra.totalInterest),
  }
}

/** Meses necessários para juntar um valor guardando "monthly" por mês (sem rendimento, ou com taxa mensal opcional). */
export function monthsToGoal(remaining: number, monthly: number, rate = 0): number {
  if (remaining <= 0) return 0
  if (monthly <= 0) return Infinity
  if (rate <= 0) return Math.ceil(remaining / monthly - 1e-9)
  // FV de série: monthly * ((1+i)^n - 1)/i >= remaining
  return Math.ceil(Math.log(1 + (remaining * rate) / monthly) / Math.log(1 + rate) - 1e-9)
}

/** Quanto guardar por mês para atingir o valor em N meses. */
export function monthlyNeeded(remaining: number, months: number): number {
  if (remaining <= 0) return 0
  if (months <= 0) return remaining
  return round2(remaining / months)
}
