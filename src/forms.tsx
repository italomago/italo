// Formulários de cadastro (abertos em "bottom sheet").
import { useMemo, useState } from 'react'
import { actions, useData } from './store'
import {
  askChoice,
  askConfirm,
  askText,
  closeForm,
  Field,
  formSignal,
  KV,
  MoneyField,
  NumberField,
  openForm,
  Picker,
  Seg,
  Sheet,
  Toggle,
  toast,
  type FormSpec,
} from './components/ui'
import { uid } from './lib/defaults'
import { addMonths, fmtDate, monthLabel, today, type ISODate } from './lib/dates'
import { fmtBRL, fmtNum, fmtPct, parseMoney, round2, splitInstallments } from './lib/money'
import { annualToMonthly, monthlyToAnnual, monthsToGoal, summarizeFinancing } from './lib/finance'
import { invoiceDueDate, invoiceFor } from './lib/generate'
import { parseQuick } from './lib/parser'
import { parseBulk } from './lib/bulk'
import { parseImport, sameName, type ImportPayload } from './lib/importer'
import { navigate } from './router'
import type {
  Account,
  Card,
  Debt,
  DebtInstallment,
  DebtKind,
  Financing,
  Frequency,
  Goal,
  Purchase,
  PurchaseStatus,
  Recurrence,
  Transaction,
} from './lib/types'

function useForm<T extends object>(initial: T) {
  const [s, setS] = useState<T>(initial)
  const set = <K extends keyof T>(k: K, v: T[K]) => setS((p) => ({ ...p, [k]: v }))
  return [s, set, setS] as const
}

const FREQ: { value: Frequency; label: string }[] = [
  { value: 'mensal', label: 'Mensal' },
  { value: 'semanal', label: 'Semanal' },
  { value: 'quinzenal', label: 'Quinzenal' },
  { value: 'bimestral', label: 'Bimestral' },
  { value: 'trimestral', label: 'Trimestral' },
  { value: 'semestral', label: 'Semestral' },
  { value: 'anual', label: 'Anual' },
]

async function askNew(label: string): Promise<string | null> {
  const v = await askText(label)
  return v && v.trim() ? v.trim() : null
}

function CategoryPicker({ kind, value, onChange }: { kind: 'in' | 'out'; value?: string; onChange: (id: string) => void }) {
  const data = useData()
  const cats = data.categories.filter((c) => c.kind === kind)
  return (
    <Field label="Categoria">
      <Picker
        options={cats.map((c) => ({ value: c.id, label: `${c.icon} ${c.name}` }))}
        value={value}
        onChange={onChange}
        onAdd={async () => {
          const name = await askNew('Nome da nova categoria')
          if (!name) return
          const id = uid()
          actions.saveCategory({ id, name, kind, icon: kind === 'in' ? '💰' : '🏷️', color: '#64748b', subs: [] })
          onChange(id)
        }}
      />
    </Field>
  )
}

function SubPicker({ categoryId, value, onChange }: { categoryId?: string; value?: string; onChange: (v: string | undefined) => void }) {
  const data = useData()
  const cat = data.categories.find((c) => c.id === categoryId)
  if (!cat) return null
  return (
    <Field label="Subcategoria (opcional)">
      <Picker
        options={cat.subs.map((s) => ({ value: s, label: s }))}
        value={value}
        onChange={(v) => onChange(v === value ? undefined : v)}
        onAdd={async () => {
          const s = await askNew(`Nova subcategoria de ${cat.name}`)
          if (!s) return
          actions.saveCategory({ ...cat, subs: [...cat.subs, s] })
          onChange(s)
        }}
      />
    </Field>
  )
}

function ListPicker({ list, label, value, onChange }: { list: 'origins' | 'methods' | 'platforms'; label: string; value?: string; onChange: (v: string) => void }) {
  const data = useData()
  return (
    <Field label={label}>
      <Picker
        options={data[list].map((s) => ({ value: s, label: s }))}
        value={value}
        onChange={onChange}
        onAdd={async () => {
          const v = await askNew(`Adicionar: ${label.toLowerCase()}`)
          if (!v) return
          actions.addToList(list, v)
          onChange(v)
        }}
      />
    </Field>
  )
}

function AccountSelect({ label = 'Conta', value, onChange, allowEmpty }: { label?: string; value?: string; onChange: (v: string | undefined) => void; allowEmpty?: boolean }) {
  const data = useData()
  return (
    <Field label={label}>
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value || undefined)}>
        {allowEmpty && <option value="">— Nenhuma —</option>}
        {data.accounts
          .filter((a) => !a.archived)
          .map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
      </select>
    </Field>
  )
}

function CardSelect({ value, onChange }: { value?: string; onChange: (v: string | undefined) => void }) {
  const data = useData()
  if (!data.cards.length)
    return (
      <div className="note warn">
        Nenhum cartão cadastrado.{' '}
        <button className="btn ghost sm" style={{ display: 'inline', padding: 0 }} onClick={() => openForm({ type: 'cartao', initial: { returnTo: formSignal.get() } })}>
          Cadastrar cartão
        </button>
      </div>
    )
  return (
    <Field label="Cartão">
      <Picker options={data.cards.map((c) => ({ value: c.id, label: `💳 ${c.name}` }))} value={value} onChange={onChange} />
    </Field>
  )
}

function DateField({ label, value, onChange, hint }: { label: string; value?: ISODate; onChange: (v: ISODate) => void; hint?: string }) {
  return (
    <Field label={label} hint={hint}>
      <input type="date" value={value ?? ''} onChange={(e) => e.target.value && onChange(e.target.value)} />
    </Field>
  )
}

function Footer({
  onSave,
  disabled,
  onDelete,
  confirmDelete,
  label = 'Salvar',
}: {
  onSave: () => void
  disabled?: boolean
  onDelete?: () => void
  /** Exclusão com perguntas próprias; devolve true se excluiu. */
  confirmDelete?: () => Promise<boolean>
  label?: string
}) {
  return (
    <div className="btn-row">
      {(onDelete || confirmDelete) && (
        <button
          className="btn danger"
          style={{ flex: '0 0 auto', width: 'auto' }}
          aria-label="Excluir"
          onClick={async () => {
            if (confirmDelete) {
              if (await confirmDelete()) {
                closeForm()
                toast('Excluído')
              }
              return
            }
            if (onDelete && await askConfirm('Excluir este item? Lançamentos gerados por ele também serão removidos.', { danger: true, okLabel: 'Excluir' })) {
              onDelete()
              closeForm()
              toast('Excluído')
            }
          }}
        >
          🗑
        </button>
      )}
      <button className="btn" disabled={disabled} onClick={onSave}>
        {label}
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Escolha do tipo + lançamento rápido
// ---------------------------------------------------------------------------

const TYPES: { type: FormSpec['type']; icon: string; label: string; sub: string; bg: string }[] = [
  { type: 'entrada', icon: '⬇️', label: 'Entrada', sub: 'Salário, venda, Pix', bg: 'var(--pos-soft)' },
  { type: 'saida', icon: '⬆️', label: 'Saída', sub: 'Despesa, conta', bg: 'var(--neg-soft)' },
  { type: 'transferencia', icon: '🔁', label: 'Transferência', sub: 'Entre contas', bg: 'var(--info-soft)' },
  { type: 'compra', icon: '🛍️', label: 'Compra parcelada', sub: 'Cartão, lojas', bg: 'var(--warn-soft)' },
  { type: 'financiamento', icon: '🏦', label: 'Financiamento', sub: 'Veículo, imóvel', bg: 'var(--primary-soft)' },
  { type: 'divida', icon: '📄', label: 'Dívida', sub: 'Empréstimo, acordo', bg: 'var(--neg-soft)' },
  { type: 'meta', icon: '🎯', label: 'Meta', sub: 'Conquista futura', bg: 'var(--pos-soft)' },
  { type: 'recorrente', icon: '🔄', label: 'Conta recorrente', sub: 'Luz, água, aluguel', bg: 'var(--surface-2)' },
]

function TypeSheet() {
  const data = useData()
  const [q, setQ] = useState('')
  const preview = useMemo(() => (q.trim().length > 2 ? parseQuick(q, data.cards) : null), [q, data.cards])
  const go = () => {
    if (!preview) return
    const p = preview
    const map: Record<string, FormSpec['type']> = {
      entrada: 'entrada',
      saida: 'saida',
      compra: 'compra',
      financiamento: 'financiamento',
      divida: 'divida',
      meta: 'meta',
      transferencia: 'transferencia',
    }
    openForm({ type: map[p.type], initial: { parsed: p } })
  }
  const label: Record<string, string> = {
    entrada: 'Entrada',
    saida: 'Saída',
    compra: 'Compra',
    financiamento: 'Financiamento',
    divida: 'Dívida',
    meta: 'Meta',
    transferencia: 'Transferência',
  }
  return (
    <Sheet title="Novo lançamento" onClose={closeForm}>
      <form
        className="quick"
        onSubmit={(e) => {
          e.preventDefault()
          go()
        }}
      >
        <input className="input" placeholder='Ex.: "Mercado Livre 1.200 10x cartão"' value={q} onChange={(e) => setQ(e.target.value)} enterKeyHint="go" />
        <button className="btn sm" disabled={!preview}>
          →
        </button>
      </form>
      {preview && (
        <div className="note" onClick={go} style={{ cursor: 'pointer' }}>
          <b>{label[preview.type]}</b>
          {preview.description && <> · {preview.description}</>}
          {preview.amount != null && <> · {fmtBRL(preview.amount)}</>}
          {preview.installments && preview.installments > 1 && <> · {preview.installments}x</>}
          {preview.method && <> · {preview.method}</>}
          {preview.date && <> · {fmtDate(preview.date)}</>}
          {preview.recurringDay && <> · todo dia {preview.recurringDay}</>}
          <div className="tiny muted">Toque para completar só o que faltar</div>
        </div>
      )}
      <div className="type-grid">
        {TYPES.map((t) => (
          <button key={t.type} className="type-btn" onClick={() => openForm({ type: t.type })}>
            <span className="ic" style={{ background: t.bg }}>
              {t.icon}
            </span>
            <span>
              {t.label}
              <small>{t.sub}</small>
            </span>
          </button>
        ))}
      </div>
    </Sheet>
  )
}

// ---------------------------------------------------------------------------
// Entrada / Saída
// ---------------------------------------------------------------------------

interface TxState {
  amount?: number
  date: ISODate
  description: string
  categoryId?: string
  subcategory?: string
  origin?: string
  method?: string
  accountId?: string
  cardId?: string
  installments: number
  firstDate?: ISODate
  recurring: boolean
  frequency: Frequency
  end?: ISODate
  paid: boolean
  note?: string
}

function TxForm({ kind, initial }: { kind: 'in' | 'out'; initial?: Record<string, unknown> }) {
  const data = useData()
  const p = initial?.parsed as ReturnType<typeof parseQuick> | undefined
  const t0 = today()
  const [s, set] = useForm<TxState>({
    amount: p?.amount,
    date: p?.date ?? t0,
    description: p?.description ?? '',
    categoryId: p?.categoryId ?? (kind === 'in' ? (p?.origin === 'Salário' ? 'salario' : undefined) : undefined),
    origin: p?.origin,
    method: p?.method ?? (kind === 'in' ? 'Pix' : undefined),
    accountId: data.accounts.find((a) => !a.archived)?.id,
    cardId: p?.cardId ?? (p?.method === 'Crédito' && data.cards.length === 1 ? data.cards[0].id : undefined),
    installments: p?.installments ?? 1,
    recurring: p?.recurringDay != null,
    frequency: 'mensal',
    paid: true,
  })
  const isCredit = s.method === 'Crédito'
  const parcelado = s.installments > 1
  const future = s.date > t0
  const valid = (s.amount ?? 0) > 0 && (!isCredit || !!s.cardId || kind === 'in')
  const card = data.cards.find((c) => c.id === s.cardId)

  const save = () => {
    const amount = s.amount!
    const description = s.description.trim() || (kind === 'in' ? (s.origin ?? 'Entrada') : (data.categories.find((c) => c.id === s.categoryId)?.name ?? 'Despesa'))
    if (s.recurring) {
      const r: Recurrence = {
        id: uid(),
        kind,
        description,
        amount,
        variable: false,
        day: p?.recurringDay ?? Number(s.date.slice(8, 10)),
        frequency: s.frequency,
        start: s.date,
        end: s.end,
        categoryId: s.categoryId,
        origin: s.origin,
        method: s.method,
        accountId: s.accountId,
        cardId: kind === 'out' && isCredit ? s.cardId : undefined,
        note: s.note,
        active: true,
      }
      if (p?.recurringDay && r.start.slice(8, 10) !== String(r.day).padStart(2, '0')) r.start = t0
      actions.saveRecurrence(r)
      toast(`${kind === 'in' ? 'Entrada' : 'Conta'} recorrente criada — próximos meses lançados`)
    } else if (kind === 'out' && (isCredit || parcelado)) {
      const pu: Purchase = {
        id: uid(),
        platform: '',
        product: description,
        total: amount,
        date: s.date,
        method: s.method ?? 'Crédito',
        installments: s.installments,
        cardId: isCredit ? s.cardId : undefined,
        accountId: s.accountId,
        categoryId: s.categoryId,
        subcategory: s.subcategory,
        status: 'entregue',
        firstDate: !isCredit ? (s.firstDate ?? s.date) : undefined,
        note: s.note,
      }
      actions.savePurchase(pu)
      toast(parcelado ? `${s.installments} parcelas lançadas` : 'Lançado na fatura do cartão')
    } else {
      actions.saveTransaction({
        kind,
        amount,
        date: s.date,
        description,
        categoryId: s.categoryId,
        subcategory: s.subcategory,
        origin: s.origin,
        method: s.method,
        accountId: s.accountId,
        paid: future ? false : s.paid,
        note: s.note,
      })
      toast(kind === 'in' ? 'Entrada registrada' : 'Saída registrada')
    }
    closeForm()
  }

  return (
    <Sheet title={kind === 'in' ? 'Nova entrada' : 'Nova saída'} onClose={closeForm} footer={<Footer onSave={save} disabled={!valid} />}>
      <MoneyField label={parcelado ? 'Valor total' : 'Valor'} value={s.amount} onChange={(v) => set('amount', v)} big autoFocus={!s.amount} />
      <Field label="Descrição">
        <input value={s.description} onChange={(e) => set('description', e.target.value)} placeholder={kind === 'in' ? 'Ex.: Salário de outubro' : 'Ex.: Supermercado'} />
      </Field>
      {kind === 'in' && <ListPicker list="origins" label="Origem do dinheiro" value={s.origin} onChange={(v) => set('origin', v)} />}
      <CategoryPicker kind={kind} value={s.categoryId} onChange={(v) => set('categoryId', v)} />
      {kind === 'out' && <SubPicker categoryId={s.categoryId} value={s.subcategory} onChange={(v) => set('subcategory', v)} />}
      <ListPicker list="methods" label={kind === 'in' ? 'Forma de recebimento' : 'Forma de pagamento'} value={s.method} onChange={(v) => set('method', v)} />
      {kind === 'out' && isCredit && <CardSelect value={s.cardId} onChange={(v) => set('cardId', v)} />}
      <div className="two">
        <DateField label={isCredit ? 'Data da compra' : 'Data'} value={s.date} onChange={(v) => set('date', v)} />
        {kind === 'out' && !s.recurring ? (
          <NumberField label="Parcelas" value={s.installments} onChange={(v) => set('installments', Math.max(1, Math.min(420, v ?? 1)))} />
        ) : (
          <AccountSelect value={s.accountId} onChange={(v) => set('accountId', v)} />
        )}
      </div>
      {kind === 'out' && parcelado && s.amount && (
        <div className="note">
          {s.installments}x de <b>{fmtBRL(splitInstallments(s.amount, s.installments)[1] ?? s.amount)}</b>
          {card && (
            <>
              {' '}
              · 1ª parcela na fatura de <b>{monthLabel(invoiceFor(card, s.date))}</b> (vence {fmtDate(invoiceDueDate(card, invoiceFor(card, s.date)))})
            </>
          )}
        </div>
      )}
      {kind === 'out' && parcelado && !isCredit && (
        <DateField label="Primeira parcela" value={s.firstDate ?? s.date} onChange={(v) => set('firstDate', v)} />
      )}
      {kind === 'out' && !isCredit && !s.recurring && <AccountSelect value={s.accountId} onChange={(v) => set('accountId', v)} />}
      {kind === 'out' && isCredit && card && !parcelado && (
        <div className="note">
          Entra na fatura de <b>{monthLabel(invoiceFor(card, s.date))}</b>
        </div>
      )}
      {!parcelado && (
        <Toggle
          label={kind === 'in' ? 'Recorrente' : 'Conta recorrente'}
          sub={kind === 'in' ? 'Ex.: salário todo mês — lança os próximos meses' : 'Repete automaticamente'}
          value={s.recurring}
          onChange={(v) => set('recurring', v)}
        />
      )}
      {s.recurring && (
        <>
          <Field label="Frequência">
            <select value={s.frequency} onChange={(e) => set('frequency', e.target.value as Frequency)}>
              {FREQ.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Data final (opcional)">
            <input type="date" value={s.end ?? ''} onChange={(e) => set('end', e.target.value || undefined)} />
          </Field>
          {p?.recurringDay && <div className="note">Todo dia {p.recurringDay}</div>}
        </>
      )}
      {!s.recurring && !(kind === 'out' && (isCredit || parcelado)) && !future && (
        <Toggle label={kind === 'in' ? 'Já recebido' : 'Já pago'} value={s.paid} onChange={(v) => set('paid', v)} />
      )}
      {future && !s.recurring && !(kind === 'out' && (isCredit || parcelado)) && (
        <div className="note">Lançamento futuro: ficará como {kind === 'in' ? 'a receber' : 'a pagar'} até a data.</div>
      )}
      <Field label="Observação">
        <textarea rows={2} value={s.note ?? ''} onChange={(e) => set('note', e.target.value)} />
      </Field>
    </Sheet>
  )
}

/** Pergunta o alcance da exclusão de um lançamento e exclui. */
async function confirmDeleteTx(tx: Transaction): Promise<boolean> {
  const t = tx.source.type
  if (t === 'manual' || !tx.source.id) {
    if (!(await askConfirm('Excluir este lançamento?', { danger: true, okLabel: 'Excluir' }))) return false
    actions.deleteTransaction(tx.id, 'one')
    return true
  }
  const label =
    t === 'recurring' ? 'despesa fixa' : t === 'purchase' ? 'compra' : t === 'debt' ? 'dívida' : t === 'financing' ? 'financiamento' : 'origem'
  const choices = [{ value: 'one', label: tx.installment ? 'Só esta parcela' : 'Só este mês' }]
  if (t === 'recurring') choices.push({ value: 'future', label: 'Este mês e os próximos' })
  choices.push({ value: 'all', label: `Apagar a ${label} inteira`, danger: true } as { value: string; label: string; danger?: boolean })
  const c = await askChoice(`“${tx.description}” faz parte de uma ${label}. O que você quer apagar?`, choices)
  if (!c) return false
  actions.deleteTransaction(tx.id, c as 'one' | 'future' | 'all')
  return true
}

/** Edição de um lançamento existente (avulso ou gerado). */
function EditTxForm({ id }: { id: string }) {
  const data = useData()
  const tx = data.transactions.find((t) => t.id === id)
  const [s, set] = useForm<Partial<Transaction>>(tx ?? {})
  if (!tx) return null
  const generated = tx.source.type !== 'manual'
  const sourceLabel: Record<string, string> = {
    purchase: 'compra',
    debt: 'dívida',
    financing: 'financiamento',
    recurring: 'conta recorrente',
  }
  const openSource = () => {
    const sid = tx.source.id!
    if (tx.source.type === 'purchase') openForm({ type: 'compra', id: sid })
    else if (tx.source.type === 'debt') openForm({ type: 'divida', id: sid })
    else if (tx.source.type === 'recurring') openForm({ type: 'recorrente', id: sid })
    else if (tx.source.type === 'financing') {
      closeForm()
      navigate('financiamentos/' + sid)
    }
  }
  const save = () => {
    actions.saveTransaction({ ...(tx as Transaction), ...(s as Transaction), id: tx.id })
    toast('Lançamento atualizado')
    closeForm()
  }
  return (
    <Sheet
      title={tx.kind === 'in' ? 'Entrada' : tx.kind === 'out' ? 'Saída' : 'Transferência'}
      onClose={closeForm}
      footer={<Footer onSave={save} disabled={!(s.amount! > 0)} confirmDelete={() => confirmDeleteTx(tx)} />}
    >
      {generated && tx.source.id && (
        <div className="note">
          {tx.installment ? `Parcela ${tx.installment.n}/${tx.installment.total} de ` : 'Gerado por '}
          {sourceLabel[tx.source.type] ?? 'lançamento'}.{' '}
          <button className="btn ghost sm" style={{ display: 'inline', padding: 0 }} onClick={openSource}>
            Abrir {sourceLabel[tx.source.type]}
          </button>
        </div>
      )}
      <MoneyField label="Valor" value={s.amount} onChange={(v) => set('amount', v)} big />
      <Field label="Descrição">
        <input value={s.description ?? ''} onChange={(e) => set('description', e.target.value)} />
      </Field>
      {tx.kind !== 'transfer' && <CategoryPicker kind={tx.kind} value={s.categoryId} onChange={(v) => set('categoryId', v)} />}
      {tx.kind === 'out' && <SubPicker categoryId={s.categoryId} value={s.subcategory} onChange={(v) => set('subcategory', v)} />}
      {!tx.cardId && tx.kind !== 'transfer' && (
        <ListPicker list="methods" label="Forma" value={s.method} onChange={(v) => set('method', v)} />
      )}
      <div className="two">
        <DateField label={tx.cardId ? 'Vencimento da fatura' : 'Data'} value={s.date} onChange={(v) => set('date', v)} />
        <AccountSelect value={s.accountId} onChange={(v) => set('accountId', v)} />
      </div>
      {tx.kind === 'transfer' && <AccountSelect label="Conta de destino" value={s.toAccountId} onChange={(v) => set('toAccountId', v)} />}
      <Toggle label={tx.kind === 'in' ? 'Recebido' : 'Pago'} value={!!s.paid} onChange={(v) => set('paid', v)} />
      <Field label="Observação">
        <textarea rows={2} value={s.note ?? ''} onChange={(e) => set('note', e.target.value)} />
      </Field>
    </Sheet>
  )
}

function TransferForm() {
  const data = useData()
  const accs = data.accounts.filter((a) => !a.archived)
  const [s, set] = useForm({ amount: undefined as number | undefined, from: accs[0]?.id as string | undefined, to: accs[1]?.id as string | undefined, date: today(), description: '' })
  const valid = (s.amount ?? 0) > 0 && s.from && s.to && s.from !== s.to
  return (
    <Sheet
      title="Transferência"
      onClose={closeForm}
      footer={
        <Footer
          disabled={!valid}
          onSave={() => {
            actions.saveTransaction({
              kind: 'transfer',
              amount: s.amount!,
              date: s.date,
              description: s.description || 'Transferência entre contas',
              accountId: s.from,
              toAccountId: s.to,
              method: 'Transferência',
              paid: s.date <= today(),
            })
            toast('Transferência registrada')
            closeForm()
          }}
        />
      }
    >
      {accs.length < 2 && (
        <div className="note warn">
          Cadastre pelo menos duas contas para transferir.{' '}
          <button className="btn ghost sm" style={{ display: 'inline', padding: 0 }} onClick={() => openForm({ type: 'conta' })}>
            Nova conta
          </button>
        </div>
      )}
      <MoneyField label="Valor" value={s.amount} onChange={(v) => set('amount', v)} big autoFocus />
      <AccountSelect label="De" value={s.from} onChange={(v) => set('from', v)} />
      <AccountSelect label="Para" value={s.to} onChange={(v) => set('to', v)} />
      <DateField label="Data" value={s.date} onChange={(v) => set('date', v)} />
      <Field label="Descrição">
        <input value={s.description} onChange={(e) => set('description', e.target.value)} placeholder="Opcional" />
      </Field>
    </Sheet>
  )
}

// ---------------------------------------------------------------------------
// Compra em plataforma / parcelada
// ---------------------------------------------------------------------------

const STATUS: { value: PurchaseStatus; label: string }[] = [
  { value: 'aguardando', label: 'Aguardando' },
  { value: 'enviado', label: 'Enviado' },
  { value: 'entregue', label: 'Entregue' },
  { value: 'cancelado', label: 'Cancelado' },
  { value: 'devolvido', label: 'Devolvido' },
]

function PurchaseForm({ id, initial }: { id?: string; initial?: Record<string, unknown> }) {
  const data = useData()
  const existing = id ? data.purchases.find((x) => x.id === id) : undefined
  const p = initial?.parsed as ReturnType<typeof parseQuick> | undefined
  const [s, set] = useForm<Purchase>(
    existing ?? {
      id: uid(),
      platform: p?.platform ?? '',
      product: p?.platform ? (p.description === p.platform ? '' : p.description) : (p?.description ?? ''),
      total: p?.amount ?? 0,
      date: p?.date ?? today(),
      method: p?.method ?? (data.cards.length ? 'Crédito' : 'Pix'),
      installments: p?.installments ?? 1,
      cardId: p?.cardId ?? (data.cards.length === 1 ? data.cards[0].id : undefined),
      accountId: data.accounts[0]?.id,
      categoryId: p?.categoryId ?? 'compras',
      status: 'aguardando',
    },
  )
  const isCredit = s.method === 'Crédito'
  const card = data.cards.find((c) => c.id === s.cardId)
  const parts = s.total > 0 ? splitInstallments(s.total, Math.max(1, s.installments)) : []
  const valid = s.total > 0 && (!isCredit || !!card) && s.installments >= 1
  const save = () => {
    const pu = { ...s, cardId: isCredit ? s.cardId : undefined, firstDate: isCredit ? undefined : (s.firstDate ?? s.date) }
    actions.savePurchase(pu)
    if (pu.platform) actions.addToList('platforms', pu.platform)
    toast(existing ? 'Compra atualizada' : s.installments > 1 ? `Compra registrada: ${s.installments} parcelas lançadas` : 'Compra registrada')
    closeForm()
  }
  return (
    <Sheet
      title={existing ? 'Editar compra' : 'Nova compra'}
      onClose={closeForm}
      footer={<Footer onSave={save} disabled={!valid} onDelete={existing ? () => actions.deletePurchase(s.id) : undefined} />}
    >
      <MoneyField label="Valor total" value={s.total || undefined} onChange={(v) => set('total', v ?? 0)} big autoFocus={!s.total} />
      <ListPicker list="platforms" label="Plataforma / loja" value={s.platform} onChange={(v) => set('platform', v)} />
      <Field label="Produto">
        <input value={s.product} onChange={(e) => set('product', e.target.value)} placeholder="Ex.: Fone de ouvido" />
      </Field>
      <ListPicker list="methods" label="Forma de pagamento" value={s.method} onChange={(v) => set('method', v)} />
      {isCredit && <CardSelect value={s.cardId} onChange={(v) => set('cardId', v)} />}
      <div className="two">
        <NumberField label="Parcelas" value={s.installments} onChange={(v) => set('installments', Math.max(1, Math.min(420, v ?? 1)))} />
        <MoneyField
          label="Valor da parcela"
          value={parts[1] ?? parts[0]}
          onChange={(v) => v && set('total', round2(v * Math.max(1, s.installments)))}
        />
      </div>
      <DateField label="Data da compra" value={s.date} onChange={(v) => set('date', v)} />
      {!isCredit && s.installments > 1 && <DateField label="Primeira parcela" value={s.firstDate ?? s.date} onChange={(v) => set('firstDate', v)} />}
      {!isCredit && <AccountSelect value={s.accountId} onChange={(v) => set('accountId', v)} />}
      {valid && (
        <div className="note">
          {s.installments}x de <b>{fmtBRL(parts[1] ?? parts[0])}</b>
          {parts.length > 1 && parts[0] !== parts[1] && <> (1ª: {fmtBRL(parts[0])})</>}
          {card && (
            <>
              <br />
              Faturas: {monthLabel(invoiceFor(card, s.date), true)} → {monthLabel(addMonths(invoiceFor(card, s.date) + '-01', s.installments - 1).slice(0, 7), true)}
            </>
          )}
        </div>
      )}
      <CategoryPicker kind="out" value={s.categoryId} onChange={(v) => set('categoryId', v)} />
      <Field label="Status da compra">
        <Picker options={STATUS} value={s.status} onChange={(v) => set('status', v)} />
      </Field>
      {(s.status === 'cancelado' || s.status === 'devolvido') && (
        <div className="note warn">Compras canceladas/devolvidas não geram parcelas nem consomem limite.</div>
      )}
      <Field label="Entrega prevista">
        <input type="date" value={s.deliveryDate ?? ''} onChange={(e) => set('deliveryDate', e.target.value || undefined)} />
      </Field>
      <Field label="Observação">
        <textarea rows={2} value={s.note ?? ''} onChange={(e) => set('note', e.target.value)} />
      </Field>
    </Sheet>
  )
}

// ---------------------------------------------------------------------------
// Financiamento
// ---------------------------------------------------------------------------

const FIN_TYPES: { value: Financing['type']; label: string }[] = [
  { value: 'veiculo', label: '🚗 Veículo' },
  { value: 'imovel', label: '🏠 Imóvel' },
  { value: 'equipamento', label: '🛠️ Equipamento' },
  { value: 'emprestimo', label: '💵 Empréstimo' },
  { value: 'outros', label: '📦 Outros' },
]

function FinancingForm({ id, initial }: { id?: string; initial?: Record<string, unknown> }) {
  const data = useData()
  const existing = id ? data.financings.find((x) => x.id === id) : undefined
  const p = initial?.parsed as ReturnType<typeof parseQuick> | undefined
  const [s, set] = useForm<Financing>(
    existing ?? {
      id: uid(),
      name: p?.description ?? '',
      institution: '',
      type: 'veiculo',
      asset: p?.description ?? '',
      financedValue: p?.amount,
      n: p?.installments ?? 48,
      firstDate: p?.date ?? addMonths(today(), 1),
      paidCount: 0,
      system: 'DESCONHECIDO',
      accountId: data.accounts[0]?.id,
    },
  )
  // taxas em % para digitação
  const [rateM, setRateM] = useState<number | undefined>(s.monthlyRate != null ? round2(s.monthlyRate * 10000) / 100 : undefined)
  const [rateA, setRateA] = useState<number | undefined>(s.annualRate != null ? round2(s.annualRate * 10000) / 100 : undefined)
  const [nominal, setNominal] = useState(false)
  const r4 = (x: number) => Math.round(x * 10000) / 10000
  // taxa anual (%) → mensal (%): nominal divide por 12; efetiva usa juros compostos
  const toMonthly = (annualPct: number, nom: boolean) => r4(nom ? annualPct / 12 : annualToMonthly(annualPct / 100) * 100)
  const merged: Financing = { ...s, monthlyRate: rateM != null ? rateM / 100 : undefined, annualRate: rateA != null ? rateA / 100 : undefined }
  const valid = s.n > 0 && ((s.financedValue ?? 0) > 0 || (s.assetValue ?? 0) > 0 || (s.installment ?? 0) > 0) && !!s.firstDate
  const sum = valid ? summarizeFinancing(merged) : null
  const save = () => {
    const f = { ...merged, name: merged.name.trim() || merged.asset || 'Financiamento' }
    if (!f.financedValue && f.assetValue) f.financedValue = round2(f.assetValue - (f.downPayment ?? 0))
    actions.saveFinancing(f)
    toast(existing ? 'Financiamento atualizado' : `Cronograma de ${f.n} parcelas criado`)
    closeForm()
    if (!existing) navigate('financiamentos/' + f.id)
  }
  return (
    <Sheet
      title={existing ? 'Editar financiamento' : 'Novo financiamento'}
      onClose={closeForm}
      footer={<Footer onSave={save} disabled={!valid} onDelete={existing ? () => actions.deleteFinancing(s.id) : undefined} />}
    >
      <Field label="Nome do financiamento">
        <input value={s.name} onChange={(e) => set('name', e.target.value)} placeholder="Ex.: Duster" />
      </Field>
      <Field label="Tipo">
        <Picker options={FIN_TYPES} value={s.type} onChange={(v) => set('type', v)} />
      </Field>
      <div className="two">
        <Field label="Instituição">
          <input value={s.institution} onChange={(e) => set('institution', e.target.value)} placeholder="Banco" />
        </Field>
        <Field label="Bem financiado">
          <input value={s.asset} onChange={(e) => set('asset', e.target.value)} placeholder="Ex.: Renault Duster" />
        </Field>
      </div>
      <div className="two">
        <MoneyField label="Valor do bem" value={s.assetValue} onChange={(v) => set('assetValue', v)} />
        <MoneyField label="Entrada" value={s.downPayment} onChange={(v) => set('downPayment', v)} />
      </div>
      <MoneyField
        label="Valor financiado"
        value={s.financedValue}
        onChange={(v) => set('financedValue', v)}
        hint={!s.financedValue && s.assetValue ? `Será usado: ${fmtBRL((s.assetValue ?? 0) - (s.downPayment ?? 0))} (bem − entrada)` : undefined}
      />
      <div className="two">
        <NumberField
          label="Juros ao mês"
          suffix="%"
          decimals
          value={rateM}
          onChange={(v) => {
            setRateM(v)
            setRateA(v != null ? r4(nominal ? v * 12 : monthlyToAnnual(v / 100) * 100) : undefined)
          }}
        />
        <NumberField
          label="Juros ao ano"
          suffix="%"
          decimals
          value={rateA}
          onChange={(v) => {
            setRateA(v)
            setRateM(v != null ? toMonthly(v, nominal) : undefined)
          }}
        />
      </div>
      <Toggle
        label="Taxa anual nominal"
        sub="Marque se o contrato diz “taxa nominal” (comum em financiamento imobiliário, ex.: Caixa). Juros ao mês = taxa anual ÷ 12."
        value={nominal}
        onChange={(v) => {
          setNominal(v)
          if (rateA != null) setRateM(toMonthly(rateA, v))
        }}
      />
      <div className="two">
        <NumberField label="Nº de parcelas" value={s.n} onChange={(v) => set('n', Math.max(1, Math.min(600, v ?? 1)))} />
        <MoneyField label="Valor da parcela" value={s.installment} onChange={(v) => set('installment', v)} hint="Se souber" />
      </div>
      <NumberField
        label="Correção do saldo ao mês (opcional)"
        suffix="%"
        decimals
        value={s.indexMonthly != null ? Math.round(s.indexMonthly * 1000000) / 10000 : undefined}
        onChange={(v) => set('indexMonthly', v != null ? v / 100 : undefined)}
        hint="Para contratos corrigidos por IPCA ou TR (ex.: IPCA ≈ 0,35% ao mês). Usado na comparação “Onde amortizar”."
      />
      <MoneyField
        label="Seguros e taxas por mês (opcional)"
        value={s.monthlyFees}
        onChange={(v) => set('monthlyFees', v)}
        hint="Seguro, taxa de administração etc. que vêm junto da parcela. Não entram nos juros nem nas simulações de quitação."
      />
      <div className="two">
        <DateField label="1ª parcela" value={s.firstDate} onChange={(v) => set('firstDate', v)} />
        <NumberField label="Parcelas pagas" value={s.paidCount} onChange={(v) => set('paidCount', Math.max(0, Math.min(s.n, v ?? 0)))} />
      </div>
      <Field label="Sistema de amortização">
        <Seg
          options={[
            { value: 'PRICE', label: 'Price' },
            { value: 'SAC', label: 'SAC' },
            { value: 'DESCONHECIDO', label: 'Não sei' },
          ]}
          value={s.system}
          onChange={(v) => set('system', v)}
        />
      </Field>
      <MoneyField
        label="Saldo devedor informado pelo banco (opcional)"
        value={s.balanceInformed}
        onChange={(v) => set('balanceInformed', v)}
        hint="Use o valor do extrato ou app do banco. As parcelas futuras e as simulações passam a ser calculadas a partir dele (essencial em contratos corrigidos por IPCA ou TR)."
      />
      <AccountSelect label="Conta de pagamento" value={s.accountId} onChange={(v) => set('accountId', v)} />
      {sum && (
        <div className="card" style={{ marginBottom: 12 }}>
          <h3>Prévia do cronograma</h3>
          <KV k="Valor financiado" v={fmtBRL(sum.resolved.principal)} />
          <KV k="Taxa" v={`${fmtPct(sum.resolved.rate, 2)} a.m. · ${fmtPct(sum.resolved.annualRate, 2)} a.a.`} />
          <KV k="1ª parcela" v={fmtBRL(sum.schedule[0]?.payment ?? 0)} />
          <KV k="Última parcela" v={`${fmtBRL(sum.schedule[sum.schedule.length - 1]?.payment ?? 0)} · ${fmtDate(sum.schedule[sum.schedule.length - 1]?.date)}`} />
          <KV k="Total de juros estimado" v={fmtBRL(sum.totalInterest)} />
          <KV k="Custo total" v={fmtBRL(sum.totalCost)} total />
          {sum.resolved.warnings.map((w) => (
            <div key={w} className="note warn" style={{ marginTop: 8, marginBottom: 0 }}>
              {w}
            </div>
          ))}
        </div>
      )}
      <Field label="Observações">
        <textarea rows={2} value={s.note ?? ''} onChange={(e) => set('note', e.target.value)} />
      </Field>
    </Sheet>
  )
}

// ---------------------------------------------------------------------------
// Dívida
// ---------------------------------------------------------------------------

/** Lista de parcelas com data e valor livres. */
function CustomInstallments({
  rows,
  onChange,
  suggestedTotal,
}: {
  rows: DebtInstallment[]
  onChange: (rows: DebtInstallment[]) => void
  suggestedTotal?: number
}) {
  const [total, setTotal] = useState<number | undefined>(suggestedTotal ?? (sumRows(rows) || undefined))
  const [count, setCount] = useState<number | undefined>(rows.length > 1 ? rows.length : 4)
  const sum = sumRows(rows)
  const update = (i: number, patch: Partial<DebtInstallment>) => onChange(rows.map((r, k) => (k === i ? { ...r, ...patch } : r)))
  const split = () => {
    if (!total || !count) return
    const parts = splitInstallments(total, count)
    const first = rows[0]?.date ?? today()
    // mantém as datas já escolhidas; as novas começam um mês depois da anterior
    onChange(parts.map((amount, i) => ({ amount, date: rows[i]?.date ?? addMonths(first, i) })))
  }
  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <h3>Parcelas do acordo</h3>
      <div className="two">
        <MoneyField label="Valor total do acordo" value={total} onChange={setTotal} />
        <NumberField label="Nº de parcelas" value={count} onChange={(v) => setCount(v ? Math.min(120, v) : undefined)} />
      </div>
      <button type="button" className="btn secondary sm" onClick={split} disabled={!total || !count} style={{ marginBottom: 12 }}>
        Dividir em parcelas iguais
      </button>
      {rows.map((r, i) => (
        <div key={i} className="inst-row">
          <span className="step-num">{i + 1}</span>
          <input type="date" className="input" value={r.date} onChange={(e) => e.target.value && update(i, { date: e.target.value })} aria-label={`Data da parcela ${i + 1}`} />
          <input
            className="input num"
            inputMode="decimal"
            defaultValue={r.amount ? fmtNum(r.amount) : ''}
            key={`${i}-${r.amount}`}
            placeholder="0,00"
            aria-label={`Valor da parcela ${i + 1}`}
            onBlur={(e) => update(i, { amount: parseMoney(e.target.value) ?? 0 })}
          />
          <button type="button" className="icon-btn" aria-label={`Remover parcela ${i + 1}`} onClick={() => onChange(rows.filter((_, k) => k !== i))}>
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn ghost sm"
        onClick={() => onChange([...rows, { date: rows.length ? addMonths(rows[rows.length - 1].date, 1) : today(), amount: rows[rows.length - 1]?.amount ?? 0 }])}
      >
        + Adicionar parcela
      </button>
      <div className="between small" style={{ marginTop: 8 }}>
        <span className="muted">{rows.length} parcela(s)</span>
        <b className="num">Total {fmtBRL(sum)}</b>
      </div>
      {total != null && total > 0 && Math.abs(total - sum) > 0.009 && rows.length > 0 && (
        <div className="note warn" style={{ marginTop: 8, marginBottom: 0 }}>
          A soma das parcelas ({fmtBRL(sum)}) é diferente do total do acordo ({fmtBRL(total)}).
        </div>
      )}
    </div>
  )
}
const sumRows = (rows: DebtInstallment[]) => round2(rows.reduce((a, r) => a + (r.amount || 0), 0))

export const DEBT_KINDS: { value: DebtKind; label: string; icon: string }[] = [
  { value: 'protesto', label: 'Protesto', icon: '⚖️' },
  { value: 'negativado', label: 'Nome negativado', icon: '🚫' },
  { value: 'atrasada', label: 'Conta atrasada', icon: '⏰' },
  { value: 'acordo', label: 'Acordo / parcelamento', icon: '🤝' },
  { value: 'emprestimo', label: 'Empréstimo', icon: '💵' },
  { value: 'cartao', label: 'Cartão', icon: '💳' },
  { value: 'outra', label: 'Outra', icon: '📄' },
]
const UNSCHEDULED_KINDS: DebtKind[] = ['protesto', 'negativado', 'atrasada']

function DebtForm({ id, initial }: { id?: string; initial?: Record<string, unknown> }) {
  const data = useData()
  const existing = id ? data.debts.find((x) => x.id === id) : undefined
  const p = initial?.parsed as ReturnType<typeof parseQuick> | undefined
  const initialKind = (initial?.kind as DebtKind | undefined) ?? 'outra'
  const [s, set, setS] = useForm<Debt>(
    existing ?? {
      id: uid(),
      name: p?.description ?? '',
      creditor: '',
      amount: p?.installments && p.amount ? round2(p.amount / p.installments) : (p?.amount ?? 0),
      firstDue: p?.date ?? today(),
      recurring: (p?.installments ?? 1) > 1,
      installments: p?.installments ?? 1,
      paidCount: 0,
      status: 'ativa',
      categoryId: 'dividas',
      accountId: data.accounts[0]?.id,
      kind: initialKind,
      scheduled: !UNSCHEDULED_KINDS.includes(initialKind),
      balance: p?.amount,
    },
  )
  const [ratePct, setRatePct] = useState<number | undefined>(s.interest != null ? round2(s.interest * 10000) / 100 : undefined)
  const scheduled = s.scheduled !== false
  const balance = s.balance ?? 0
  const custom = scheduled && !!s.customSchedule
  const customRows = (s.customSchedule ?? []).filter((r) => r.amount > 0 && r.date).sort((a, b) => a.date.localeCompare(b.date))
  const valid = !!s.name.trim() && (scheduled ? (custom ? customRows.length > 0 : s.amount > 0) : balance > 0)
  const total = s.recurring && s.installments > 0 ? s.amount * s.installments : s.amount
  const discount = s.offer && balance > 0 && s.offer < balance ? balance - s.offer : 0
  const save = () => {
    const interest = ratePct != null ? ratePct / 100 : undefined
    if (custom)
      actions.saveDebt({
        ...s,
        interest,
        scheduled: true,
        recurring: true,
        customSchedule: customRows,
        installments: customRows.length,
        amount: customRows[0].amount,
        firstDue: customRows[0].date,
      })
    else if (scheduled) actions.saveDebt({ ...s, interest, scheduled: true, customSchedule: undefined, installments: s.recurring ? s.installments : 1 })
    else actions.saveDebt({ ...s, interest, scheduled: false, amount: balance, recurring: false, installments: 1 })
    toast(existing ? 'Dívida atualizada' : 'Dívida cadastrada')
    closeForm()
  }
  return (
    <Sheet
      title={existing ? 'Editar dívida' : 'Nova dívida'}
      onClose={closeForm}
      footer={<Footer onSave={save} disabled={!valid} onDelete={existing ? () => actions.deleteDebt(s.id) : undefined} />}
    >
      <Field label="Tipo de dívida">
        <Picker
          options={DEBT_KINDS.map((k) => ({ value: k.value, label: `${k.icon} ${k.label}` }))}
          value={s.kind ?? (s.recurring ? 'acordo' : 'outra')}
          onChange={(v) =>
            setS((prev) => ({ ...prev, kind: v, scheduled: existing ? prev.scheduled : !UNSCHEDULED_KINDS.includes(v) }))
          }
        />
      </Field>
      <div className="two">
        <Field label="Nome da dívida">
          <input value={s.name} onChange={(e) => set('name', e.target.value)} placeholder="Ex.: Protesto loja X" autoFocus={!existing} />
        </Field>
        <Field label="Credor">
          <input value={s.creditor} onChange={(e) => set('creditor', e.target.value)} placeholder="Ex.: Banco, loja, cartório" />
        </Field>
      </div>
      <Field label="Pagamento">
        <Seg
          options={[
            { value: 'aberto', label: 'Ainda sem acordo' },
            { value: 'programado', label: 'Já pagando / com data' },
          ]}
          value={scheduled ? 'programado' : 'aberto'}
          onChange={(v) =>
            setS((prev) => ({
              ...prev,
              scheduled: v === 'programado',
              amount: v === 'programado' && !prev.amount ? (prev.offer ?? prev.balance ?? 0) : prev.amount,
            }))
          }
        />
      </Field>

      {!scheduled ? (
        <>
          <MoneyField label="Valor devido hoje" value={s.balance || undefined} onChange={(v) => set('balance', v)} big />
          <MoneyField
            label="Proposta para quitar à vista (opcional)"
            value={s.offer}
            onChange={(v) => set('offer', v)}
            hint="Valor com desconto oferecido pelo credor, Serasa Limpa Nome, feirão etc."
          />
          {discount > 0 && (
            <div className="note pos">
              Desconto de <b>{fmtBRL(discount)}</b> ({Math.round((discount / balance) * 100)}%) se pagar {fmtBRL(s.offer!)} à vista.
            </div>
          )}
          <NumberField label="Juros ao mês, se souber" suffix="%" decimals value={ratePct} onChange={setRatePct} />
          <div className="note">Dívidas sem acordo não entram nas saídas do mês. Elas aparecem no <b>Plano de pagamento</b>, que mostra em que ordem pagar e quando você fica livre delas.</div>
        </>
      ) : (
        <>
          <Field label="Forma">
            <Seg
              options={[
                { value: 'u', label: 'Única' },
                { value: 'p', label: 'Mensal' },
                { value: 'c', label: 'Datas que eu escolho' },
              ]}
              value={custom ? 'c' : s.recurring ? 'p' : 'u'}
              onChange={(v) =>
                setS((prev) => ({
                  ...prev,
                  recurring: v !== 'u',
                  customSchedule:
                    v === 'c'
                      ? prev.customSchedule?.length
                        ? prev.customSchedule
                        : [{ date: prev.firstDue, amount: prev.amount || 0 }]
                      : undefined,
                }))
              }
            />
          </Field>
          {custom ? (
            <CustomInstallments
              rows={s.customSchedule ?? []}
              onChange={(rows) => set('customSchedule', rows)}
              suggestedTotal={s.offer ?? s.balance}
            />
          ) : (
            <>
              <MoneyField label={s.recurring ? 'Valor de cada parcela' : 'Valor'} value={s.amount || undefined} onChange={(v) => set('amount', v ?? 0)} big />
              <div className="two">
                <DateField label={s.recurring ? '1º vencimento' : 'Vencimento'} value={s.firstDue} onChange={(v) => set('firstDue', v)} />
                {s.recurring && (
                  <NumberField label="Nº de parcelas" value={s.installments} onChange={(v) => set('installments', Math.max(0, Math.min(600, v ?? 0)))} hint="0 = sem prazo" />
                )}
              </div>
            </>
          )}
          {s.recurring && (
            <div className="two">
              <NumberField label="Parcelas pagas" value={s.paidCount} onChange={(v) => set('paidCount', Math.max(0, v ?? 0))} />
              <NumberField label="Juros ao mês" suffix="%" decimals value={ratePct} onChange={setRatePct} />
            </div>
          )}
          {s.recurring && !custom && s.installments > 0 && (
            <div className="note">
              Restam <b>{Math.max(0, s.installments - s.paidCount)}</b> parcelas · total {fmtBRL(total)} · falta{' '}
              <b>{fmtBRL(Math.max(0, s.installments - s.paidCount) * s.amount)}</b>
            </div>
          )}
          <AccountSelect value={s.accountId} onChange={(v) => set('accountId', v)} />
        </>
      )}
      <Field label="Situação">
        <Picker
          options={[
            { value: 'ativa', label: 'Em aberto' },
            { value: 'negociando', label: 'Negociando' },
            { value: 'quitada', label: '✓ Quitada' },
          ]}
          value={s.status}
          onChange={(v) => set('status', v as Debt['status'])}
        />
      </Field>
      <Field label="Observação">
        <textarea rows={2} value={s.note ?? ''} onChange={(e) => set('note', e.target.value)} placeholder="Ex.: cartório, nº do protesto, contato do credor" />
      </Field>
    </Sheet>
  )
}

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

const GOAL_ICONS = ['🎯', '🚗', '🏠', '✈️', '🛟', '💻', '📈', '💳', '🎓', '💍', '🏍️', '👶']

function GoalForm({ id, initial }: { id?: string; initial?: Record<string, unknown> }) {
  const data = useData()
  const existing = id ? data.goals.find((x) => x.id === id) : undefined
  const p = initial?.parsed as ReturnType<typeof parseQuick> | undefined
  const [s, set] = useForm<Goal>(
    existing ?? {
      id: uid(),
      name: p?.description ?? '',
      target: p?.amount ?? 0,
      initial: 0,
      entries: [],
      priority: 'media',
      icon: '🎯',
      createdAt: Date.now(),
    },
  )
  const saved = s.initial + s.entries.reduce((a, e) => a + e.amount, 0)
  const remaining = Math.max(0, s.target - saved)
  const months = s.monthly ? monthsToGoal(remaining, s.monthly) : null
  const valid = s.target > 0 && !!s.name.trim()
  return (
    <Sheet
      title={existing ? 'Editar meta' : 'Nova meta'}
      onClose={closeForm}
      footer={
        <Footer
          disabled={!valid}
          onDelete={existing ? () => actions.deleteGoal(s.id) : undefined}
          onSave={() => {
            actions.saveGoal(s)
            toast(existing ? 'Meta atualizada' : 'Meta criada')
            closeForm()
          }}
        />
      }
    >
      <Field label="Nome da meta">
        <input value={s.name} onChange={(e) => set('name', e.target.value)} placeholder="Ex.: Viagem para o Nordeste" autoFocus={!s.name} />
      </Field>
      <div className="picker">
        {GOAL_ICONS.map((i) => (
          <button key={i} type="button" className={s.icon === i ? 'on' : ''} onClick={() => set('icon', i)} style={{ fontSize: 20 }}>
            {i}
          </button>
        ))}
      </div>
      <div className="two">
        <MoneyField label="Valor necessário" value={s.target || undefined} onChange={(v) => set('target', v ?? 0)} />
        <MoneyField label="Já acumulado" value={s.initial || undefined} onChange={(v) => set('initial', v ?? 0)} />
      </div>
      <div className="two">
        <Field label="Data desejada">
          <input type="date" value={s.targetDate ?? ''} onChange={(e) => set('targetDate', e.target.value || undefined)} />
        </Field>
        <MoneyField label="Guardar por mês" value={s.monthly} onChange={(v) => set('monthly', v)} />
      </div>
      {valid && (
        <div className="note">
          Falta <b>{fmtBRL(remaining)}</b>.
          {months != null && Number.isFinite(months) && (
            <>
              {' '}
              Guardando {fmtBRL(s.monthly!)} por mês, você chega lá em <b>{months} meses</b> ({monthLabel(addMonths(today(), months).slice(0, 7))}).
            </>
          )}
        </div>
      )}
      <Field label="Prioridade">
        <Seg
          options={[
            { value: 'alta', label: 'Alta' },
            { value: 'media', label: 'Média' },
            { value: 'baixa', label: 'Baixa' },
          ]}
          value={s.priority}
          onChange={(v) => set('priority', v)}
        />
      </Field>
      <Field label="Observação">
        <textarea rows={2} value={s.note ?? ''} onChange={(e) => set('note', e.target.value)} />
      </Field>
    </Sheet>
  )
}

// ---------------------------------------------------------------------------
// Conta recorrente
// ---------------------------------------------------------------------------

const BILL_PRESETS = ['Energia', 'Água', 'Internet', 'Telefone', 'Streaming', 'Aluguel', 'Escola', 'Seguro', 'Condomínio', 'Academia']
const PRESET_CAT: Record<string, string> = {
  Energia: 'casa',
  Água: 'casa',
  Internet: 'casa',
  Telefone: 'assinaturas',
  Streaming: 'assinaturas',
  Aluguel: 'casa',
  Escola: 'educacao',
  Seguro: 'servicos',
  Condomínio: 'casa',
  Academia: 'saude',
}

function RecurrenceForm({ id }: { id?: string }) {
  const data = useData()
  const existing = id ? data.recurrences.find((x) => x.id === id) : undefined
  const [s, set, setS] = useForm<Recurrence>(
    existing ?? {
      id: uid(),
      kind: 'out',
      description: '',
      amount: 0,
      variable: false,
      day: Number(today().slice(8, 10)),
      frequency: 'mensal',
      start: today(),
      method: 'Boleto',
      accountId: data.accounts[0]?.id,
      active: true,
    },
  )
  const valid = s.amount > 0 && !!s.description.trim() && s.day >= 1 && s.day <= 31
  return (
    <Sheet
      title={existing ? 'Editar recorrência' : 'Conta recorrente'}
      onClose={closeForm}
      footer={
        <Footer
          disabled={!valid}
          onDelete={existing ? () => actions.deleteRecurrence(s.id) : undefined}
          onSave={() => {
            actions.saveRecurrence({ ...s, cardId: s.method === 'Crédito' ? s.cardId : undefined })
            toast(existing ? 'Atualizado — lançamentos futuros recalculados' : 'Recorrência criada — próximos meses lançados')
            closeForm()
          }}
        />
      }
    >
      <Seg
        tone={s.kind}
        options={[
          { value: 'out', label: 'Despesa' },
          { value: 'in', label: 'Receita' },
        ]}
        value={s.kind}
        onChange={(v) => set('kind', v)}
      />
      <div className="spacer" />
      {s.kind === 'out' && !existing && (
        <div className="picker">
          {BILL_PRESETS.map((b) => (
            <button key={b} type="button" className={s.description === b ? 'on' : ''} onClick={() => setS((p) => ({ ...p, description: b, categoryId: PRESET_CAT[b] }))}>
              {b}
            </button>
          ))}
        </div>
      )}
      <Field label="Descrição">
        <input value={s.description} onChange={(e) => set('description', e.target.value)} />
      </Field>
      <MoneyField label={s.variable ? 'Valor estimado' : 'Valor'} value={s.amount || undefined} onChange={(v) => set('amount', v ?? 0)} />
      <Toggle label="Valor variável" sub="Ex.: energia e água. Ajuste o valor real em cada mês." value={s.variable} onChange={(v) => set('variable', v)} />
      <div className="two">
        <NumberField label="Dia de vencimento" value={s.day} onChange={(v) => set('day', Math.max(1, Math.min(31, v ?? 1)))} />
        <Field label="Frequência">
          <select value={s.frequency} onChange={(e) => set('frequency', e.target.value as Frequency)}>
            {FREQ.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="two">
        <DateField label="Início" value={s.start} onChange={(v) => set('start', v)} />
        <Field label="Fim (opcional)">
          <input type="date" value={s.end ?? ''} onChange={(e) => set('end', e.target.value || undefined)} />
        </Field>
      </div>
      <CategoryPicker kind={s.kind} value={s.categoryId} onChange={(v) => set('categoryId', v)} />
      {s.kind === 'in' && <ListPicker list="origins" label="Origem" value={s.origin} onChange={(v) => set('origin', v)} />}
      <ListPicker list="methods" label="Forma" value={s.method} onChange={(v) => set('method', v)} />
      {s.kind === 'out' && s.method === 'Crédito' && <CardSelect value={s.cardId} onChange={(v) => set('cardId', v)} />}
      <AccountSelect value={s.accountId} onChange={(v) => set('accountId', v)} />
      {existing && <Toggle label="Ativa" sub="Desative para parar de gerar lançamentos futuros" value={s.active} onChange={(v) => set('active', v)} />}
    </Sheet>
  )
}

/** Cadastro de várias despesas fixas de uma vez (lista colada, uma por linha). */
function BulkRecurrenceForm() {
  const data = useData()
  const [text, setText] = useState('')
  const [day, setDay] = useState<number | undefined>(10)
  const items = useMemo(() => parseBulk(text), [text])
  const existing = new Set(data.recurrences.map((r) => r.description.trim().toLowerCase()))
  const fresh = items.filter((i) => !existing.has(i.name.toLowerCase()))
  const catLabel = (id: string) => {
    const c = data.categories.find((x) => x.id === id)
    return c ? `${c.icon} ${c.name}` : id
  }
  const save = () => {
    const t0 = today()
    actions.saveRecurrences(
      fresh.map((i) => ({
        id: uid(),
        kind: 'out' as const,
        description: i.name,
        amount: i.amount,
        variable: i.amount === 0,
        day: i.day ?? day ?? 10,
        frequency: 'mensal' as const,
        start: t0,
        categoryId: i.categoryId,
        method: 'Boleto',
        accountId: data.accounts.find((a) => !a.archived)?.id,
        active: true,
      })),
    )
    toast(`${fresh.length} despesas fixas adicionadas`)
    closeForm()
  }
  return (
    <Sheet
      title="Adicionar várias despesas fixas"
      onClose={closeForm}
      footer={<Footer onSave={save} disabled={!fresh.length} label={fresh.length ? `Adicionar ${fresh.length} despesa(s)` : 'Adicionar'} />}
    >
      <div className="note">
        Cole a lista com <b>uma despesa por linha</b>. Pode ter só o nome, ou também valor e dia, por exemplo: <b>Gazin 175 todo dia 15</b>. As que ficarem sem valor você completa depois, tocando nelas.
      </div>
      <Field label="Lista de despesas">
        <textarea id="bulk-text" rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder={'Aluguel 1.500 todo dia 10\nEnergia\nInternet 120'} />
      </Field>
      <NumberField label="Dia de vencimento para as que não informarem" value={day} onChange={(v) => setDay(v != null ? Math.max(1, Math.min(31, v)) : undefined)} />
      {items.length > 0 && (
        <div className="card tight" style={{ marginBottom: 12 }}>
          {items.map((i, k) => {
            const dup = existing.has(i.name.toLowerCase())
            return (
              <div key={k} className="list-item" style={{ opacity: dup ? 0.5 : 1 }}>
                <div className="main">
                  <div className="title">{i.name}</div>
                  <div className="meta">
                    {catLabel(i.categoryId)} · todo dia {i.day ?? day ?? 10}
                    {dup && ' · já cadastrada'}
                  </div>
                </div>
                <div className="end">{i.amount > 0 ? <b className="num">{fmtBRL(i.amount)}</b> : <span className="badge warn">definir valor</span>}</div>
              </div>
            )
          })}
        </div>
      )}
    </Sheet>
  )
}

/** Importa cadastros preparados (ex.: financiamentos lidos dos contratos). Não apaga nada. */
function ImportForm() {
  const data = useData()
  const [text, setText] = useState('')
  let payload: ImportPayload | null = null
  let error = ''
  if (text.trim()) {
    try {
      payload = parseImport(text)
    } catch (e) {
      error = (e as Error).message
    }
  }
  const toRemove = payload ? data.recurrences.filter((r) => payload!.removeRecurrences.some((n) => sameName(n, r.description))) : []
  const save = () => {
    if (!payload) return
    const r = actions.importMerge(payload)
    toast(
      [r.added && `${r.added} financiamento(s) cadastrado(s)`, r.updated && `${r.updated} atualizado(s)`, r.removed && `${r.removed} despesa(s) fixa(s) removida(s)`]
        .filter(Boolean)
        .join(' · ') || 'Nada a importar',
    )
    closeForm()
    navigate('financiamentos')
  }
  return (
    <Sheet title="Importar cadastro" onClose={closeForm} footer={<Footer onSave={save} disabled={!payload} label="Importar" />}>
      <div className="note">
        Cole aqui o texto de cadastro que você recebeu. Os itens são <b>adicionados</b> aos seus dados; nada é apagado (um financiamento com o mesmo nome é atualizado).
      </div>
      <Field label="Texto do cadastro">
        <textarea id="import-text" rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder='{"app":"minhas-financas-importar", ...}' />
      </Field>
      {error && <div className="note neg">{error}</div>}
      {payload && (
        <div className="card" style={{ marginBottom: 12 }}>
          <h3>Será importado</h3>
          {payload.financings.map((f) => {
            const s = summarizeFinancing(f)
            const exists = data.financings.some((x) => sameName(x.name, f.name))
            return (
              <div key={f.name} className="kv">
                <span>
                  🏦 {f.name} {exists && <span className="badge info">atualizar</span>}
                </span>
                <span>
                  {s.paidCount}/{s.resolved.n} pagas · próx. {fmtBRL(s.nextInstallment?.payment ?? 0)}
                </span>
              </div>
            )
          })}
          {toRemove.length > 0 && (
            <div className="small muted" style={{ marginTop: 8 }}>
              Despesas fixas removidas para não contar duas vezes: <b>{toRemove.map((r) => r.description).join(', ')}</b>
            </div>
          )}
        </div>
      )}
    </Sheet>
  )
}

// ---------------------------------------------------------------------------
// Cartão e conta
// ---------------------------------------------------------------------------

function CardForm({ id, initial }: { id?: string; initial?: Record<string, unknown> }) {
  const data = useData()
  const existing = id ? data.cards.find((x) => x.id === id) : undefined
  const [s, set] = useForm<Card>(existing ?? { id: uid(), name: '', bank: '', limit: 0, closingDay: 1, dueDay: 10, accountId: data.accounts[0]?.id })
  const valid = !!s.name.trim() && s.closingDay >= 1 && s.closingDay <= 31 && s.dueDay >= 1 && s.dueDay <= 31
  const returnTo = initial?.returnTo as FormSpec | undefined
  return (
    <Sheet
      title={existing ? 'Editar cartão' : 'Novo cartão'}
      onClose={closeForm}
      footer={
        <Footer
          disabled={!valid}
          onDelete={existing ? () => actions.deleteCard(s.id) : undefined}
          onSave={() => {
            actions.saveCard(s)
            toast('Cartão salvo')
            if (returnTo) openForm(returnTo)
            else closeForm()
          }}
        />
      }
    >
      <div className="two">
        <Field label="Nome do cartão">
          <input value={s.name} onChange={(e) => set('name', e.target.value)} placeholder="Ex.: Nubank" autoFocus />
        </Field>
        <Field label="Banco">
          <input value={s.bank} onChange={(e) => set('bank', e.target.value)} />
        </Field>
      </div>
      <MoneyField label="Limite total" value={s.limit || undefined} onChange={(v) => set('limit', v ?? 0)} />
      <div className="two">
        <NumberField label="Dia de fechamento" value={s.closingDay || undefined} onChange={(v) => set('closingDay', v ?? 0)} placeholder="1 a 31" />
        <NumberField label="Dia de vencimento" value={s.dueDay || undefined} onChange={(v) => set('dueDay', v ?? 0)} placeholder="1 a 31" />
      </div>
      {(!(s.closingDay >= 1 && s.closingDay <= 31) || !(s.dueDay >= 1 && s.dueDay <= 31)) && (
        <div className="note warn">Informe os dias de fechamento e de vencimento (de 1 a 31).</div>
      )}
      <div className="note">Compras feitas a partir do dia de fechamento entram na fatura seguinte.</div>
      <AccountSelect label="Conta que paga a fatura" value={s.accountId} onChange={(v) => set('accountId', v)} />
    </Sheet>
  )
}

function AccountForm({ id }: { id?: string }) {
  const data = useData()
  const existing = id ? data.accounts.find((x) => x.id === id) : undefined
  const [s, set] = useForm<Account>(existing ?? { id: uid(), name: '', type: 'corrente', initialBalance: 0, balanceDate: today() })
  return (
    <Sheet
      title={existing ? 'Editar conta' : 'Nova conta'}
      onClose={closeForm}
      footer={
        <Footer
          disabled={!s.name.trim()}
          onDelete={existing && data.accounts.filter((a) => !a.archived).length > 1 ? () => actions.deleteAccount(s.id) : undefined}
          onSave={() => {
            actions.saveAccount(s)
            toast('Conta salva')
            closeForm()
          }}
        />
      }
    >
      <Field label="Nome">
        <input value={s.name} onChange={(e) => set('name', e.target.value)} placeholder="Ex.: Itaú, Carteira" autoFocus={!existing} />
      </Field>
      <Field label="Tipo">
        <Picker
          options={[
            { value: 'corrente', label: 'Conta corrente' },
            { value: 'poupanca', label: 'Poupança' },
            { value: 'carteira', label: 'Carteira' },
            { value: 'investimento', label: 'Investimento' },
            { value: 'outra', label: 'Outra' },
          ]}
          value={s.type}
          onChange={(v) => set('type', v as Account['type'])}
        />
      </Field>
      <MoneyField label="Saldo na data abaixo" value={s.initialBalance} onChange={(v) => set('initialBalance', v ?? 0)} />
      <DateField
        label="Data do saldo"
        value={s.balanceDate}
        onChange={(v) => set('balanceDate', v)}
        hint="Lançamentos pagos a partir desta data alteram o saldo. Os anteriores já estão incluídos no valor acima."
      />
    </Sheet>
  )
}

// ---------------------------------------------------------------------------

export function FormHost() {
  const spec = formSignal.use()
  if (!spec) return null
  const key = spec.type + (spec.id ?? '') + JSON.stringify(spec.initial ?? {})
  switch (spec.type) {
    case 'tipo':
      return <TypeSheet key={key} />
    case 'entrada':
      return <TxForm key={key} kind="in" initial={spec.initial} />
    case 'saida':
      return <TxForm key={key} kind="out" initial={spec.initial} />
    case 'tx':
      return <EditTxForm key={key} id={spec.id!} />
    case 'transferencia':
      return <TransferForm key={key} />
    case 'compra':
      return <PurchaseForm key={key} id={spec.id} initial={spec.initial} />
    case 'financiamento':
      return <FinancingForm key={key} id={spec.id} initial={spec.initial} />
    case 'divida':
      return <DebtForm key={key} id={spec.id} initial={spec.initial} />
    case 'meta':
      return <GoalForm key={key} id={spec.id} initial={spec.initial} />
    case 'recorrente':
      return <RecurrenceForm key={key} id={spec.id} />
    case 'cartao':
      return <CardForm key={key} id={spec.id} initial={spec.initial} />
    case 'conta':
      return <AccountForm key={key} id={spec.id} />
    case 'lote':
      return <BulkRecurrenceForm key={key} />
    case 'importar':
      return <ImportForm key={key} />
  }
}

