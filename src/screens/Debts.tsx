// Aba Dívidas: protestos, nome negativado, contas atrasadas, acordos e financiamentos num só lugar,
// com um plano de pagamento (em que ordem pagar e quando fica livre).
import { useState } from 'react'
import { useData } from '../store'
import { Empty, KV, Money, MoneyField, Progress, Section, Seg, Toggle, TopBar, openForm } from '../components/ui'
import { navigate } from '../router'
import { fmtDate, monthLabel } from '../lib/dates'
import { fmtBRL, fmtPct, sum } from '../lib/money'
import { summarizeFinancing } from '../lib/finance'
import { debtBalance, debtKind, isOpen, planPayoff, type Strategy } from '../lib/payoff'
import { DEBT_KINDS } from '../forms'
import type { Debt } from '../lib/types'

type View = 'dividas' | 'plano' | 'financiamentos'
const LS_KEY = 'minhas-financas:plano-dividas'

const kindInfo = (d: Debt) => DEBT_KINDS.find((k) => k.value === debtKind(d)) ?? DEBT_KINDS[DEBT_KINDS.length - 1]
const FIN_ICON: Record<string, string> = { veiculo: '🚗', imovel: '🏠', equipamento: '🛠️', emprestimo: '💵', outros: '📦' }

function loadPrefs(): { budget?: number; strategy?: Strategy; rollover?: boolean } {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? '{}')
  } catch {
    return {}
  }
}

export function Debts({ initialView }: { initialView?: View }) {
  const data = useData()
  const [view, setView] = useState<View>(initialView ?? 'dividas')

  const debts = data.debts
  const open = debts.filter(isOpen)
  const scheduled = debts.filter((d) => d.status !== 'quitada' && d.scheduled !== false)
  const done = debts.filter((d) => d.status === 'quitada')
  const remainingOf = (d: Debt) =>
    sum(data.transactions.filter((t) => t.source.type === 'debt' && t.source.id === d.id && !t.paid).map((t) => t.amount))
  const openTotal = sum(open.map(debtBalance))
  const scheduledTotal = sum(scheduled.map(remainingOf))
  const fins = data.financings.map((f) => ({ f, s: summarizeFinancing(f) })).filter((x) => x.s.remainingCount > 0)
  const finTotal = sum(fins.map((x) => x.s.balance))
  const protests = open.filter((d) => debtKind(d) === 'protesto' || debtKind(d) === 'negativado').length

  return (
    <div className="screen">
      <TopBar
        title="Dívidas"
        right={
          <button className="icon-btn" onClick={() => openForm({ type: 'divida' })} aria-label="Nova dívida">
            ＋
          </button>
        }
      />
      <div className="card hero">
        <div className="label">Total que você deve</div>
        <div className="big">
          <Money value={openTotal + scheduledTotal + finTotal} />
        </div>
        <div className="row">
          <div className="pill">
            <small>Dívidas{protests ? ` · ${protests} no nome` : ''}</small>
            <b>
              <Money value={openTotal + scheduledTotal} />
            </b>
          </div>
          <div className="pill">
            <small>Financiamentos</small>
            <b>
              <Money value={finTotal} />
            </b>
          </div>
        </div>
      </div>
      <div className="spacer" />
      <Seg
        options={[
          { value: 'dividas', label: 'Minhas dívidas' },
          { value: 'plano', label: 'Plano' },
          { value: 'financiamentos', label: 'Financiam.' },
        ]}
        value={view}
        onChange={setView}
      />
      <div className="spacer" />

      {view === 'dividas' && (
        <>
          {!debts.length && (
            <div className="card">
              <Empty
                icon="🧾"
                title="Cadastre suas dívidas"
                text="Protestos, nome negativado, contas atrasadas, acordos e empréstimos. O app monta um plano para você pagar tudo."
                action="+ Nova dívida"
                onAction={() => openForm({ type: 'divida' })}
              />
            </div>
          )}
          {open.length > 0 && (
            <>
              <Section title={`Sem acordo · ${fmtBRL(openTotal)}`} />
              <div className="card tight">
                {[...open]
                  .sort((a, b) => debtBalance(b) - debtBalance(a))
                  .map((d) => {
                    const k = kindInfo(d)
                    const discount = d.offer && d.offer < debtBalance(d) ? debtBalance(d) - d.offer : 0
                    return (
                      <div key={d.id} className="list-item" role="button" onClick={() => openForm({ type: 'divida', id: d.id })}>
                        <div className="ic" style={{ background: 'var(--neg-soft)' }}>
                          {k.icon}
                        </div>
                        <div className="main">
                          <div className="title">{d.name}</div>
                          <div className="meta">
                            {[k.label, d.creditor, d.status === 'negociando' ? 'negociando' : null, d.interest ? `${fmtPct(d.interest, 2)} a.m.` : null]
                              .filter(Boolean)
                              .join(' · ')}
                          </div>
                          {discount > 0 && <div className="meta pos">À vista por {fmtBRL(d.offer!)} (−{fmtBRL(discount)})</div>}
                        </div>
                        <div className="end amount">
                          <Money value={debtBalance(d)} />
                        </div>
                      </div>
                    )
                  })}
              </div>
            </>
          )}
          {scheduled.length > 0 && (
            <>
              <Section title={`Em acordo / pagando · ${fmtBRL(scheduledTotal)}`} />
              <div className="card tight">
                {scheduled.map((d) => {
                  const k = kindInfo(d)
                  const txs = data.transactions.filter((t) => t.source.type === 'debt' && t.source.id === d.id)
                  const paid = txs.filter((t) => t.paid).length
                  const next = txs.filter((t) => !t.paid).sort((a, b) => a.date.localeCompare(b.date))[0]
                  return (
                    <div key={d.id} className="list-item" role="button" onClick={() => openForm({ type: 'divida', id: d.id })}>
                      <div className="ic">{k.icon}</div>
                      <div className="main">
                        <div className="title">{d.name}</div>
                        <div className="meta">
                          {d.recurring && d.installments ? `${paid}/${d.installments} pagas` : k.label}
                          {next ? ` · próx. ${fmtDate(next.date)}` : ''}
                        </div>
                        {d.recurring && d.installments > 1 && (
                          <div style={{ marginTop: 6 }}>
                            <Progress pct={paid / d.installments} tone="pos" />
                          </div>
                        )}
                      </div>
                      <div className="end">
                        <div className="amount">
                          <Money value={remainingOf(d)} />
                        </div>
                        {next && (
                          <div className="tiny muted">
                            parcela <Money value={next.amount} />
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
          {done.length > 0 && (
            <>
              <Section title={`Quitadas · ${done.length}`} />
              <div className="card tight">
                {done.map((d) => (
                  <div key={d.id} className="list-item" role="button" onClick={() => openForm({ type: 'divida', id: d.id })} style={{ opacity: 0.6 }}>
                    <div className="ic">✅</div>
                    <div className="main">
                      <div className="title">{d.name}</div>
                      <div className="meta">{kindInfo(d).label}</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
          {debts.length > 0 && (
            <button className="btn secondary" style={{ marginTop: 12 }} onClick={() => setView('plano')}>
              📋 Ver plano para quitar
            </button>
          )}
          <button className="btn ghost" style={{ marginTop: 6 }} onClick={() => navigate('compromissos')}>
            Ver contas a vencer e atrasadas
          </button>
        </>
      )}

      {view === 'plano' && <Plan />}

      {view === 'financiamentos' && (
        <>
          {fins.length ? (
            <div className="card tight">
              {fins.map(({ f, s }) => (
                <div key={f.id} className="list-item" role="button" onClick={() => navigate('financiamentos/' + f.id)}>
                  <div className="ic">{FIN_ICON[f.type] ?? '🏦'}</div>
                  <div className="main">
                    <div className="title">{f.name}</div>
                    <div className="meta">
                      {s.paidCount}/{s.resolved.n} pagas · próx. {fmtDate(s.nextInstallment?.date)}
                    </div>
                    <div style={{ marginTop: 6 }}>
                      <Progress pct={s.pctPaid} tone="pos" />
                    </div>
                  </div>
                  <div className="end">
                    <div className="amount">
                      <Money value={s.balance} />
                    </div>
                    <div className="tiny muted">
                      parcela <Money value={s.nextInstallment?.payment ?? 0} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="card small muted center">Nenhum financiamento ativo.</div>
          )}
          <div className="stack" style={{ marginTop: 12 }}>
            <button className="btn secondary" onClick={() => navigate('amortizar')}>
              ⚖️ Onde amortizar? Comparar financiamentos
            </button>
            <button className="btn secondary" onClick={() => navigate('financiamentos')}>
              🏦 Abrir financiamentos e simulador
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function Plan() {
  const data = useData()
  const prefs = loadPrefs()
  const [budget, setBudget] = useState<number | undefined>(prefs.budget ?? 500)
  const [strategy, setStrategy] = useState<Strategy>(prefs.strategy ?? 'protestos')
  const [rollover, setRollover] = useState(prefs.rollover ?? true)
  const save = (p: object) => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ budget, strategy, rollover, ...p }))
    } catch {
      /* sem armazenamento */
    }
  }
  const plan = planPayoff(data.debts, data.transactions, budget ?? 0, strategy, { rollover })

  if (!plan.steps.length && !plan.scheduled.length)
    return (
      <div className="card">
        <Empty icon="🎉" title="Nenhuma dívida em aberto" text="Cadastre protestos, nome negativado, contas atrasadas ou acordos para montar o plano." action="+ Nova dívida" onAction={() => openForm({ type: 'divida' })} />
      </div>
    )

  return (
    <>
      <MoneyField
        big
        label="Consigo separar por mês para as dívidas"
        value={budget}
        onChange={(v) => {
          setBudget(v)
          save({ budget: v })
        }}
      />
      <Seg
        options={[
          { value: 'protestos', label: 'Limpar o nome' },
          { value: 'menores', label: 'Menores' },
          { value: 'caras', label: 'Mais caras' },
        ]}
        value={strategy}
        onChange={(v) => {
          setStrategy(v)
          save({ strategy: v })
        }}
      />
      <div className="tiny muted" style={{ margin: '6px 2px 10px' }}>
        {strategy === 'protestos' && 'Primeiro protestos e nome negativado, para voltar a ter crédito. Depois o restante, das menores para as maiores.'}
        {strategy === 'menores' && 'Quita primeiro as menores: menos dívidas rapidamente e mais motivação (método bola de neve).'}
        {strategy === 'caras' && 'Quita primeiro as que têm mais juros: é a que faz você pagar menos no total.'}
      </div>
      {plan.scheduled.length > 0 && (
        <Toggle
          label="Somar parcelas dos acordos que terminam"
          sub="Quando um acordo acaba, o valor da parcela passa a ajudar a pagar as outras dívidas."
          value={rollover}
          onChange={(v) => {
            setRollover(v)
            save({ rollover: v })
          }}
        />
      )}

      <div className={`note ${plan.neverEnds ? 'warn' : 'pos'}`}>
        {plan.neverEnds ? (
          <>Com esse valor por mês as dívidas não terminam. Aumente o valor mensal ou negocie propostas à vista.</>
        ) : plan.debtFreeMonth ? (
          <>
            🎉 Você fica <b>livre das dívidas em {monthLabel(plan.debtFreeMonth).toLowerCase()}</b> ({plan.months} {plan.months === 1 ? 'mês' : 'meses'}).
            {plan.totalSaved > 0 && (
              <>
                {' '}
                Aproveitando as propostas à vista você economiza <b>{fmtBRL(plan.totalSaved)}</b>.
              </>
            )}
          </>
        ) : null}
      </div>

      {plan.steps.length > 0 && (
        <>
          <Section title="Ordem para pagar" />
          {plan.steps.map((s, i) => {
            const k = DEBT_KINDS.find((x) => x.value === s.kind)!
            return (
              <div key={s.id} className="card" role="button" style={{ cursor: 'pointer' }} onClick={() => openForm({ type: 'divida', id: s.id })}>
                <div className="between">
                  <div className="row" style={{ minWidth: 0 }}>
                    <span className="step-num">{i + 1}</span>
                    <div style={{ minWidth: 0 }}>
                      <div className="bold">
                        {k.icon} {s.name}
                      </div>
                      <div className="tiny muted">{[k.label, s.creditor].filter(Boolean).join(' · ')}</div>
                    </div>
                  </div>
                  <span className={`badge ${s.paidMonth ? 'pos' : 'warn'}`}>{s.paidMonth ? monthLabel(s.paidMonth, true) : 'sem previsão'}</span>
                </div>
                <div className="divider" />
                <KV k="Deve hoje" v={fmtBRL(s.balance)} />
                {s.hasOffer ? (
                  <KV k="Pagar à vista (proposta)" v={<b className="pos">{fmtBRL(s.target)}</b>} />
                ) : (
                  <KV k={s.interest ? `Total a pagar (com ${fmtPct(s.interest, 2)} a.m.)` : 'Total a pagar'} v={<b>{fmtBRL(s.paidMonth ? s.paid : s.target)}</b>} />
                )}
                {s.saved > 0 && <KV k="Desconto" v={<span className="pos">{fmtBRL(s.saved)}</span>} />}
                <div className="tiny muted" style={{ marginTop: 6 }}>
                  {s.hasOffer ? 'Junte o valor da proposta e pague de uma vez.' : 'Pague o que conseguir separar a cada mês até quitar.'}
                  {s.kind === 'protesto' && ' Depois de pagar, peça a carta de anuência ao credor e leve ao cartório para cancelar o protesto.'}
                  {s.kind === 'negativado' && ' Depois de pagar, o credor tem até 5 dias úteis para tirar seu nome dos cadastros (Serasa, SPC).'}
                </div>
              </div>
            )
          })}
        </>
      )}

      {plan.scheduled.length > 0 && (
        <>
          <Section title="Acordos em andamento" />
          <div className="card">
            {plan.scheduled.map((s) => (
              <KV
                key={s.id}
                k={s.installment ? `${s.name} · ${s.remaining}x ${fmtBRL(s.installment)}` : `${s.name} · ${s.remaining} parcela(s) · ${fmtBRL(s.remainingValue)}`}
                v={s.endMonth ? `termina ${monthLabel(s.endMonth, true)}` : '—'}
              />
            ))}
          </div>
        </>
      )}

      <div className="card" style={{ marginTop: 10 }}>
        <h3>Dicas para negociar</h3>
        <div className="small muted stack">
          <div>• Peça sempre a proposta à vista: costuma ter descontos grandes, principalmente em dívidas antigas.</div>
          <div>• Consulte o Serasa Limpa Nome, o Registrato do Banco Central (dívidas em bancos) e os mutirões de renegociação.</div>
          <div>• Protesto: após pagar, peça a carta de anuência ao credor e leve ao cartório para cancelar.</div>
          <div>• Só feche acordo com parcela que cabe no mês: acordo quebrado volta a dívida inteira.</div>
        </div>
      </div>
    </>
  )
}
