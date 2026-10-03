// Estado global do app, persistido no próprio aparelho (localStorage).
import { useSyncExternalStore } from 'react'
import { emptyData, uid } from './lib/defaults'
import {
  debtDrafts,
  financingDrafts,
  horizon,
  mergeSource,
  paidCountFromTxs,
  purchaseDrafts,
  recurrenceDrafts,
  regenerateAll,
  removeSource,
} from './lib/generate'
import { addDays, today } from './lib/dates'
import { sameName, type ImportPayload } from './lib/importer'
import type {
  Account,
  AppData,
  Card,
  Category,
  Debt,
  Financing,
  Goal,
  GoalEntry,
  Purchase,
  Recurrence,
  Settings,
  Transaction,
} from './lib/types'

const KEY = 'minhas-financas:data'

function migrate(raw: Partial<AppData>): AppData {
  const base = emptyData()
  const d: AppData = {
    ...base,
    ...raw,
    reserve: { ...base.reserve, ...(raw.reserve ?? {}) },
    settings: { ...base.settings, ...(raw.settings ?? {}), alerts: { ...base.settings.alerts, ...(raw.settings?.alerts ?? {}) } },
  }
  d.accounts = d.accounts.map((a) => ({ ...a, balanceDate: a.balanceDate ?? today() }))
  return d
}

/** Chave estável de um lançamento gerado (compra, dívida, financiamento, recorrência). */
export const genKey = (t: Pick<Transaction, 'source' | 'key'>) => `${t.source.type}:${t.source.id}:${t.key}`

/** Remove lançamentos que o usuário apagou, mesmo que a origem tente recriá-los. */
function dropDeleted(d: AppData): AppData {
  if (!d.deletedKeys?.length) return d
  const del = new Set(d.deletedKeys)
  const transactions = d.transactions.filter((t) => t.source.type === 'manual' || !t.key || !del.has(genKey(t)))
  return transactions.length === d.transactions.length ? d : { ...d, transactions }
}

function load(): AppData {
  try {
    const s = localStorage.getItem(KEY)
    if (s) {
      const d = migrate(JSON.parse(s))
      if (!d.generatedUntil || d.generatedUntil < horizon()) return dropDeleted(regenerateAll(d))
      return dropDeleted(d)
    }
  } catch (e) {
    console.error('Falha ao carregar dados', e)
  }
  return emptyData()
}

let data: AppData = load()
const listeners = new Set<() => void>()

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(data))
  } catch (e) {
    console.error('Falha ao salvar', e)
    alert('Não foi possível salvar os dados no aparelho (armazenamento cheio?). Faça um backup.')
  }
}

export function setData(next: AppData) {
  data = dropDeleted(next)
  persist()
  listeners.forEach((l) => l())
}
function update(fn: (d: AppData) => AppData) {
  setData(fn(data))
}

export function getData() {
  return data
}

export function useData(): AppData {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => data,
  )
}

// Pede ao navegador para não apagar os dados automaticamente.
if (typeof navigator !== 'undefined' && navigator.storage?.persist) navigator.storage.persist().catch(() => {})

const upsert = <T extends { id: string }>(list: T[], item: T) =>
  list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item]

// ---------------------------------------------------------------------------
// Ações
// ---------------------------------------------------------------------------

export const actions = {
  // Lançamentos avulsos
  saveTransaction(t: Omit<Transaction, 'id' | 'createdAt' | 'source'> & { id?: string; source?: Transaction['source'] }) {
    update((d) => {
      const prev = t.id ? d.transactions.find((x) => x.id === t.id) : undefined
      const tx: Transaction = {
        ...prev,
        ...t,
        id: t.id ?? uid(),
        createdAt: prev?.createdAt ?? Date.now(),
        source: t.source ?? prev?.source ?? { type: 'manual' },
      } as Transaction
      if (prev && prev.source.type !== 'manual' && prev.amount !== tx.amount) tx.edited = true
      const next = { ...d, transactions: upsert(d.transactions, tx) }
      return syncCounts(next, tx)
    })
  },
  /**
   * Apaga um lançamento. Para lançamentos gerados (despesa fixa, compra, dívida, financiamento):
   * - 'one': só este (fica registrado para não voltar)
   * - 'future': este e os próximos (encerra a despesa fixa na data anterior)
   * - 'all': apaga a origem inteira
   */
  deleteTransaction(id: string, scope: 'one' | 'future' | 'all' = 'one') {
    const t = data.transactions.find((x) => x.id === id)
    if (!t) return
    const src = t.source
    if (scope === 'all' && src.id) {
      if (src.type === 'recurring') return actions.deleteRecurrence(src.id)
      if (src.type === 'purchase') return actions.deletePurchase(src.id)
      if (src.type === 'debt') return actions.deleteDebt(src.id)
      if (src.type === 'financing') return actions.deleteFinancing(src.id)
    }
    if (scope === 'future' && src.type === 'recurring' && src.id) {
      const r = data.recurrences.find((x) => x.id === src.id)
      if (r) {
        const end = addDays(t.date, -1)
        if (end < r.start) return actions.deleteRecurrence(r.id)
        update((d) => ({
          ...d,
          recurrences: d.recurrences.map((x) => (x.id === r.id ? { ...x, end } : x)),
          transactions: d.transactions.filter((x) => !(x.source.type === 'recurring' && x.source.id === r.id && x.date >= t.date && !x.paid)),
        }))
        return
      }
    }
    update((d) => ({
      ...d,
      transactions: d.transactions.filter((x) => x.id !== id),
      deletedKeys: src.type !== 'manual' && t.key ? [...(d.deletedKeys ?? []), genKey(t)] : d.deletedKeys,
    }))
    if (src.type === 'debt' || src.type === 'financing') update((d) => syncCounts(d, t))
  },
  setPaid(id: string, paid: boolean, accountId?: string) {
    update((d) => {
      let changed: Transaction | undefined
      const transactions = d.transactions.map((t) => {
        if (t.id !== id) return t
        changed = { ...t, paid, accountId: accountId ?? t.accountId }
        return changed
      })
      return changed ? syncCounts({ ...d, transactions }, changed) : d
    })
  },

  // Recorrências
  saveRecurrence(r: Recurrence) {
    update((d) => {
      const next = { ...d, recurrences: upsert(d.recurrences, r) }
      next.transactions = mergeSource(d.transactions, 'recurring', r.id, recurrenceDrafts(r, d.cards, horizon()), { pastAsPaid: true })
      return next
    })
  },
  /** Várias recorrências de uma vez (uma única gravação). */
  saveRecurrences(list: Recurrence[]) {
    update((d) => {
      let transactions = d.transactions
      let recurrences = d.recurrences
      for (const r of list) {
        recurrences = upsert(recurrences, r)
        transactions = mergeSource(transactions, 'recurring', r.id, recurrenceDrafts(r, d.cards, horizon()), { pastAsPaid: true })
      }
      return { ...d, recurrences, transactions }
    })
  },
  deleteRecurrence(id: string) {
    update((d) => ({
      ...d,
      recurrences: d.recurrences.filter((r) => r.id !== id),
      // mantém o histórico já pago como lançamento avulso
      transactions: d.transactions
        .filter((t) => !(t.source.type === 'recurring' && t.source.id === id && !t.paid))
        .map((t) => (t.source.type === 'recurring' && t.source.id === id ? { ...t, source: { type: 'manual' as const } } : t)),
    }))
  },

  // Compras (inclui despesas parceladas e no cartão)
  savePurchase(p: Purchase) {
    update((d) => ({
      ...d,
      purchases: upsert(d.purchases, p),
      transactions: mergeSource(d.transactions, 'purchase', p.id, purchaseDrafts(p, d.cards), { pastAsPaid: true }),
    }))
  },
  deletePurchase(id: string) {
    update((d) => ({ ...d, purchases: d.purchases.filter((p) => p.id !== id), transactions: removeSource(d.transactions, 'purchase', id) }))
  },

  // Dívidas
  saveDebt(debt: Debt) {
    update((d) => {
      const prev = d.debts.find((x) => x.id === debt.id)
      const respect = !prev || prev.paidCount !== debt.paidCount || prev.status !== debt.status
      return {
        ...d,
        debts: upsert(d.debts, debt),
        transactions: mergeSource(d.transactions, 'debt', debt.id, debtDrafts(debt, horizon()), { respectDraftPaid: respect }),
      }
    })
  },
  deleteDebt(id: string) {
    update((d) => ({ ...d, debts: d.debts.filter((x) => x.id !== id), transactions: removeSource(d.transactions, 'debt', id) }))
  },

  // Financiamentos
  saveFinancing(f: Financing) {
    update((d) => {
      const prev = d.financings.find((x) => x.id === f.id)
      const respect = !prev || prev.paidCount !== f.paidCount
      return {
        ...d,
        financings: upsert(d.financings, f),
        transactions: mergeSource(d.transactions, 'financing', f.id, financingDrafts(f), { respectDraftPaid: respect }),
      }
    })
  },
  /** Adiciona cadastros colados (financiamentos) sem apagar o restante. Financiamento com o mesmo nome é atualizado. */
  importMerge(payload: ImportPayload) {
    let added = 0
    let updated = 0
    let removed = 0
    update((d) => {
      let next = d
      const fallback = d.accounts.find((a) => !a.archived)?.id
      for (const f of payload.financings) {
        const prev = next.financings.find((x) => sameName(x.name, f.name))
        const fin: Financing = { ...f, id: prev?.id ?? uid(), accountId: prev?.accountId ?? fallback }
        if (prev) updated++
        else added++
        next = {
          ...next,
          financings: upsert(next.financings, fin),
          transactions: mergeSource(next.transactions, 'financing', fin.id, financingDrafts(fin), { respectDraftPaid: true }),
        }
      }
      for (const name of payload.removeRecurrences) {
        for (const r of next.recurrences.filter((x) => sameName(x.description, name))) {
          removed++
          next = {
            ...next,
            recurrences: next.recurrences.filter((x) => x.id !== r.id),
            transactions: next.transactions
              .filter((t) => !(t.source.type === 'recurring' && t.source.id === r.id && !t.paid))
              .map((t) => (t.source.type === 'recurring' && t.source.id === r.id ? { ...t, source: { type: 'manual' as const } } : t)),
          }
        }
      }
      return next
    })
    return { added, updated, removed }
  },
  deleteFinancing(id: string) {
    update((d) => ({ ...d, financings: d.financings.filter((x) => x.id !== id), transactions: removeSource(d.transactions, 'financing', id) }))
  },

  // Cartões e faturas
  saveCard(c: Card) {
    update((d) => regenerateAll({ ...d, cards: upsert(d.cards, c) }))
  },
  deleteCard(id: string) {
    update((d) => ({
      ...d,
      cards: d.cards.filter((c) => c.id !== id),
      purchases: d.purchases.map((p) => (p.cardId === id ? { ...p, cardId: undefined } : p)),
      recurrences: d.recurrences.map((r) => (r.cardId === id ? { ...r, cardId: undefined } : r)),
    }))
    update((d) => regenerateAll(d))
  },
  payInvoice(cardId: string, month: string, accountId?: string, paid = true) {
    update((d) => ({
      ...d,
      transactions: d.transactions.map((t) =>
        t.cardId === cardId && t.invoice === month ? { ...t, paid, accountId: accountId ?? t.accountId } : t,
      ),
    }))
  },

  // Contas
  saveAccount(a: Account) {
    update((d) => ({ ...d, accounts: upsert(d.accounts, a) }))
  },
  deleteAccount(id: string) {
    update((d) => ({ ...d, accounts: d.accounts.map((a) => (a.id === id ? { ...a, archived: true } : a)) }))
  },

  // Metas
  saveGoal(g: Goal) {
    update((d) => ({ ...d, goals: upsert(d.goals, g) }))
  },
  deleteGoal(id: string) {
    update((d) => ({ ...d, goals: d.goals.filter((g) => g.id !== id) }))
  },
  addGoalEntry(goalId: string, e: Omit<GoalEntry, 'id'>) {
    update((d) => ({
      ...d,
      goals: d.goals.map((g) => (g.id === goalId ? { ...g, entries: [...g.entries, { ...e, id: uid() }] } : g)),
    }))
  },
  removeGoalEntry(goalId: string, entryId: string) {
    update((d) => ({
      ...d,
      goals: d.goals.map((g) => (g.id === goalId ? { ...g, entries: g.entries.filter((e) => e.id !== entryId) } : g)),
    }))
  },

  // Reserva
  setReserve(target: number, targetMonths: number) {
    update((d) => ({ ...d, reserve: { ...d.reserve, target, targetMonths } }))
  },
  addReserveEntry(e: Omit<GoalEntry, 'id'>) {
    update((d) => ({ ...d, reserve: { ...d.reserve, entries: [...d.reserve.entries, { ...e, id: uid() }] } }))
  },
  removeReserveEntry(id: string) {
    update((d) => ({ ...d, reserve: { ...d.reserve, entries: d.reserve.entries.filter((e) => e.id !== id) } }))
  },

  // Cadastros auxiliares
  saveCategory(c: Category) {
    update((d) => ({ ...d, categories: upsert(d.categories, c) }))
  },
  deleteCategory(id: string) {
    update((d) => ({ ...d, categories: d.categories.filter((c) => c.id !== id) }))
  },
  addToList(list: 'origins' | 'methods' | 'platforms', value: string) {
    const v = value.trim()
    if (!v) return
    update((d) => (d[list].some((x) => x.toLowerCase() === v.toLowerCase()) ? d : { ...d, [list]: [...d[list], v] }))
  },
  removeFromList(list: 'origins' | 'methods' | 'platforms', value: string) {
    update((d) => ({ ...d, [list]: d[list].filter((x) => x !== value) }))
  },

  updateSettings(s: Partial<Settings>) {
    update((d) => ({ ...d, settings: { ...d.settings, ...s } }))
  },

  importData(raw: unknown) {
    const d = migrate(raw as Partial<AppData>)
    if (!Array.isArray(d.transactions)) throw new Error('Arquivo inválido')
    setData(regenerateAll(d))
  },
  resetAll() {
    setData(emptyData())
  },
}

/** Mantém o nº de parcelas pagas de dívidas/financiamentos alinhado aos lançamentos. */
function syncCounts(d: AppData, t: Transaction): AppData {
  if (t.source.type === 'debt' && t.source.id) {
    const id = t.source.id
    const count = paidCountFromTxs(d.transactions, 'debt', id)
    return { ...d, debts: d.debts.map((x) => (x.id === id ? { ...x, paidCount: count } : x)) }
  }
  if (t.source.type === 'financing' && t.source.id) {
    const id = t.source.id
    const count = paidCountFromTxs(d.transactions, 'financing', id)
    return { ...d, financings: d.financings.map((x) => (x.id === id ? { ...x, paidCount: count } : x)) }
  }
  return d
}
