import type { ISODate } from './dates'
import type { AmortSystem } from './finance'

export type Kind = 'in' | 'out' | 'transfer'

export type SourceType = 'manual' | 'recurring' | 'purchase' | 'debt' | 'financing' | 'card-expense' | 'invoice'

export interface Transaction {
  id: string
  kind: Kind
  amount: number
  date: ISODate // data de efeito no caixa (para cartão: vencimento da fatura)
  description: string
  categoryId?: string
  subcategory?: string
  origin?: string // entradas
  method?: string // forma de pagamento / recebimento
  accountId?: string
  toAccountId?: string // transferências
  cardId?: string
  invoice?: string // "AAAA-MM" — mês de vencimento da fatura
  purchaseDate?: ISODate // data original da compra (cartão)
  paid: boolean
  note?: string
  installment?: { n: number; total: number }
  source: { type: SourceType; id?: string }
  key?: string // chave estável dentro da origem (ex.: "p3" = parcela 3, ou data da recorrência)
  edited?: boolean // valor alterado manualmente (preservado ao regenerar)
  createdAt: number
}

export interface Account {
  id: string
  name: string
  type: 'corrente' | 'poupanca' | 'carteira' | 'investimento' | 'outra'
  initialBalance: number
  balanceDate: ISODate // data a que o saldo inicial se refere
  archived?: boolean
}

export interface Card {
  id: string
  name: string
  bank: string
  limit: number
  closingDay: number
  dueDay: number
  color?: string
  accountId?: string // conta usada para pagar a fatura
}

export interface Category {
  id: string
  name: string
  kind: 'in' | 'out'
  icon: string
  color: string
  subs: string[]
}

export type Frequency = 'mensal' | 'semanal' | 'quinzenal' | 'bimestral' | 'trimestral' | 'semestral' | 'anual'

export interface Recurrence {
  id: string
  kind: 'in' | 'out'
  description: string
  amount: number
  variable: boolean // valor variável (estimado)
  day: number // dia de vencimento / recebimento
  frequency: Frequency
  start: ISODate
  end?: ISODate
  categoryId?: string
  origin?: string
  method?: string
  accountId?: string
  cardId?: string
  note?: string
  active: boolean
}

export type PurchaseStatus = 'aguardando' | 'enviado' | 'entregue' | 'cancelado' | 'devolvido'

export interface Purchase {
  id: string
  platform: string
  product: string
  total: number
  date: ISODate
  method: string
  installments: number
  cardId?: string
  accountId?: string
  categoryId?: string
  subcategory?: string
  status: PurchaseStatus
  deliveryDate?: ISODate
  firstDate?: ISODate // primeira parcela (quando não é cartão)
  note?: string
}

export interface Debt {
  id: string
  name: string
  creditor: string
  amount: number // valor de cada parcela / da conta
  firstDue: ISODate
  recurring: boolean // true = parcelada/mensal, false = única
  installments: number
  paidCount: number
  interest?: number // juros mensal (decimal)
  status: 'ativa' | 'quitada' | 'negociando'
  categoryId?: string
  accountId?: string
  note?: string
}

export interface Financing {
  id: string
  name: string
  institution: string
  type: 'veiculo' | 'imovel' | 'equipamento' | 'emprestimo' | 'outros'
  asset: string
  assetValue?: number
  downPayment?: number
  financedValue?: number
  monthlyRate?: number
  annualRate?: number
  n: number
  installment?: number
  firstDate: ISODate
  paidCount: number
  balanceInformed?: number
  monthlyFees?: number // seguros e taxas por mês
  indexMonthly?: number // correção estimada do saldo ao mês (IPCA/TR), decimal
  system: AmortSystem
  accountId?: string
  note?: string
}

export interface GoalEntry {
  id: string
  date: ISODate
  amount: number // positivo = aporte, negativo = retirada
  note?: string
}

export interface Goal {
  id: string
  name: string
  target: number
  initial: number
  entries: GoalEntry[]
  targetDate?: ISODate
  monthly?: number
  priority: 'alta' | 'media' | 'baixa'
  icon: string
  note?: string
  createdAt: number
}

export interface Reserve {
  target: number
  targetMonths: number // meta em meses de despesas
  entries: GoalEntry[]
}

export interface AlertSettings {
  bills: boolean
  installments: boolean
  invoices: boolean
  cardLimit: boolean
  goals: boolean
  negativeBalance: boolean
  financingEnd: boolean
  overdue: boolean
  daysBefore: number
  cardLimitPct: number
}

export interface Settings {
  pinHash?: string
  pinSalt?: string
  pinLength?: number
  biometricId?: string
  lockOnStart: boolean
  hideValues: boolean
  email?: string
  lastBackup?: number
  notifications: boolean
  alerts: AlertSettings
  theme: 'auto' | 'claro' | 'escuro'
  onboarded: boolean
}

export interface AppData {
  version: number
  transactions: Transaction[]
  accounts: Account[]
  cards: Card[]
  categories: Category[]
  origins: string[]
  methods: string[]
  platforms: string[]
  recurrences: Recurrence[]
  purchases: Purchase[]
  debts: Debt[]
  financings: Financing[]
  goals: Goal[]
  reserve: Reserve
  settings: Settings
  generatedUntil?: ISODate
}
