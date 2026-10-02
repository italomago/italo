import type { AppData, Category } from './types'
import { today } from './dates'

export const uid = () =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36)
  ).slice(0, 12)

const cat = (id: string, name: string, kind: 'in' | 'out', icon: string, color: string, subs: string[] = []): Category => ({
  id,
  name,
  kind,
  icon,
  color,
  subs,
})

export const DEFAULT_CATEGORIES: Category[] = [
  cat('casa', 'Casa', 'out', '🏠', '#6366f1', ['Aluguel', 'Condomínio', 'Energia', 'Água', 'Gás', 'Internet', 'Manutenção']),
  cat('alimentacao', 'Alimentação', 'out', '🍽️', '#f97316', ['Restaurante', 'Delivery', 'Lanche', 'Padaria']),
  cat('combustivel', 'Combustível', 'out', '⛽', '#ef4444', ['Gasolina', 'Etanol', 'Diesel', 'GNV']),
  cat('veiculo', 'Veículo', 'out', '🚗', '#0ea5e9', ['Manutenção', 'IPVA', 'Seguro', 'Estacionamento', 'Pedágio', 'Lavagem']),
  cat('mercado', 'Mercado', 'out', '🛒', '#22c55e', ['Supermercado', 'Feira', 'Açougue', 'Farmácia']),
  cat('compras', 'Compras', 'out', '🛍️', '#ec4899', ['Roupas', 'Eletrônicos', 'Casa', 'Presentes']),
  cat('lazer', 'Lazer', 'out', '🎉', '#a855f7', ['Cinema', 'Bares', 'Passeios', 'Jogos']),
  cat('viagens', 'Viagens', 'out', '✈️', '#14b8a6', ['Passagem', 'Hospedagem', 'Passeios']),
  cat('educacao', 'Educação', 'out', '🎓', '#3b82f6', ['Escola', 'Faculdade', 'Cursos', 'Livros']),
  cat('saude', 'Saúde', 'out', '🩺', '#10b981', ['Plano de saúde', 'Consultas', 'Exames', 'Remédios', 'Academia']),
  cat('assinaturas', 'Assinaturas', 'out', '📺', '#8b5cf6', ['Streaming', 'Música', 'Aplicativos', 'Telefone']),
  cat('impostos', 'Impostos', 'out', '🧾', '#64748b', ['IPTU', 'IPVA', 'IR', 'Taxas']),
  cat('servicos', 'Serviços', 'out', '🛠️', '#f59e0b', ['Diarista', 'Profissionais', 'Banco/Tarifas']),
  cat('dividas', 'Dívidas', 'out', '💳', '#dc2626', ['Empréstimo', 'Acordo', 'Cheque especial']),
  cat('financiamentos', 'Financiamentos', 'out', '🏦', '#b45309', []),
  cat('outros-out', 'Outros', 'out', '📦', '#94a3b8', []),
  cat('salario', 'Salário', 'in', '💼', '#16a34a', []),
  cat('renda-extra', 'Renda extra', 'in', '💡', '#0d9488', ['Freelance', 'Venda', 'Comissão']),
  cat('investimentos', 'Investimentos', 'in', '📈', '#2563eb', ['Rendimentos', 'Dividendos', 'Resgate']),
  cat('outros-in', 'Outros', 'in', '💰', '#65a30d', []),
]

export const DEFAULT_ORIGINS = [
  'Salário',
  'Comissão',
  'Premiação',
  'Venda',
  'Trabalho extra',
  'Pix recebido',
  'Transferência',
  'Outros',
]

export const DEFAULT_METHODS = ['Pix', 'Dinheiro', 'Débito', 'Crédito', 'Transferência', 'Boleto', 'Outros']

export const DEFAULT_PLATFORMS = ['Mercado Livre', 'Amazon', 'Shopee', 'Magazine Luiza', 'Loja física', 'Outros']

export function emptyData(): AppData {
  return {
    version: 1,
    transactions: [],
    accounts: [{ id: 'principal', name: 'Conta principal', type: 'corrente', initialBalance: 0, balanceDate: today() }],
    cards: [],
    categories: DEFAULT_CATEGORIES.map((c) => ({ ...c, subs: [...c.subs] })),
    origins: [...DEFAULT_ORIGINS],
    methods: [...DEFAULT_METHODS],
    platforms: [...DEFAULT_PLATFORMS],
    recurrences: [],
    purchases: [],
    debts: [],
    financings: [],
    goals: [],
    reserve: { target: 0, targetMonths: 6, entries: [] },
    settings: {
      lockOnStart: false,
      hideValues: false,
      notifications: false,
      theme: 'auto',
      onboarded: false,
      alerts: {
        bills: true,
        installments: true,
        invoices: true,
        cardLimit: true,
        goals: true,
        negativeBalance: true,
        financingEnd: true,
        overdue: true,
        daysBefore: 3,
        cardLimitPct: 0.8,
      },
    },
  }
}
