// Exportação para Excel (CSV no padrão brasileiro) e compartilhamento de arquivos.
import { fmtDate } from './dates'
import type { AppData, Transaction } from './types'

const num = (n: number) => n.toFixed(2).replace('.', ',')
const cell = (v: string | number | undefined | null) => {
  const s = v == null ? '' : typeof v === 'number' ? num(v) : String(v)
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** CSV com ";" e vírgula decimal, que o Excel em português abre corretamente. */
export function toCSV(rows: (string | number | undefined | null)[][]): string {
  return '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n')
}

const KIND = { in: 'Entrada', out: 'Saída', transfer: 'Transferência' } as const
const SOURCE: Record<string, string> = {
  manual: 'Lançamento',
  recurring: 'Recorrente',
  purchase: 'Compra',
  debt: 'Dívida',
  financing: 'Financiamento',
  'card-expense': 'Cartão',
  invoice: 'Fatura',
}

export function transactionsCSV(data: AppData, txs: Transaction[] = data.transactions): string {
  const cat = (id?: string) => data.categories.find((c) => c.id === id)?.name ?? ''
  const acc = (id?: string) => data.accounts.find((a) => a.id === id)?.name ?? ''
  const card = (id?: string) => data.cards.find((c) => c.id === id)?.name ?? ''
  const rows: (string | number | undefined)[][] = [
    ['Data', 'Tipo', 'Descrição', 'Valor', 'Categoria', 'Subcategoria', 'Origem', 'Forma', 'Conta', 'Cartão', 'Fatura', 'Parcela', 'Situação', 'Fonte', 'Observação'],
  ]
  for (const t of [...txs].sort((a, b) => a.date.localeCompare(b.date))) {
    rows.push([
      fmtDate(t.date),
      KIND[t.kind],
      t.description,
      t.kind === 'out' ? -t.amount : t.amount,
      cat(t.categoryId),
      t.subcategory,
      t.origin,
      t.cardId ? 'Crédito' : t.method,
      acc(t.accountId),
      card(t.cardId),
      t.invoice ? `${t.invoice.slice(5)}/${t.invoice.slice(0, 4)}` : '',
      t.installment ? `${t.installment.n}/${t.installment.total}` : '',
      t.paid ? 'Pago' : 'Pendente',
      SOURCE[t.source.type] ?? '',
      t.note,
    ])
  }
  return toCSV(rows)
}

export function downloadFile(name: string, content: string | Blob, type = 'text/plain') {
  const blob = content instanceof Blob ? content : new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

/** Usa a planilha de compartilhamento do celular (e-mail, Drive, iCloud, WhatsApp...) quando disponível. */
export async function shareFile(name: string, content: string, type: string, text?: string): Promise<'shared' | 'downloaded'> {
  const file = new File([content], name, { type })
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: name, text })
      return 'shared'
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e
    }
  }
  downloadFile(name, content, type)
  return 'downloaded'
}
