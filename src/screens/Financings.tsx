import { useMemo, useState } from 'react'
import { actions, useData } from '../store'
import { Empty, KV, Money, MoneyField, NumberField, Progress, Section, Seg, TopBar, openForm, toast } from '../components/ui'
import { LineChart } from '../components/charts'
import { navigate } from '../router'
import { addMonths, fmtDate, monthLabel } from '../lib/dates'
import { fmtBRL, fmtPct, round2 } from '../lib/money'
import {
  anticipateLast,
  extraMonthly,
  extraordinaryPayment,
  futurePayments,
  loanStateFrom,
  pmt,
  summarizeFinancing,
  type LoanState,
} from '../lib/finance'
import type { Financing } from '../lib/types'

const TYPE_ICON: Record<Financing['type'], string> = { veiculo: '🚗', imovel: '🏠', equipamento: '🛠️', emprestimo: '💵', outros: '📦' }

export function Financings() {
  const data = useData()
  const list = data.financings.map((f) => ({ f, s: summarizeFinancing(f) }))
  const totalBalance = list.reduce((a, x) => a + (x.s.remainingCount ? x.s.balance : 0), 0)
  const totalRemaining = list.reduce((a, x) => a + x.s.totalRemaining, 0)
  const monthly = list.reduce((a, x) => a + (x.s.nextInstallment?.payment ?? 0), 0)
  return (
    <div className="screen">
      <TopBar
        title="Financiamentos"
        right={
          <>
            <button className="icon-btn" onClick={() => navigate('amortizar')} aria-label="Onde amortizar">
              ⚖️
            </button>
            <button className="icon-btn" onClick={() => openForm({ type: 'importar' })} aria-label="Importar cadastro">
              📥
            </button>
            <button className="icon-btn" onClick={() => openForm({ type: 'financiamento' })} aria-label="Novo financiamento">
              ＋
            </button>
          </>
        }
      />
      {list.length > 0 && (
        <div className="card hero">
          <div className="label">Saldo devedor total</div>
          <div className="big">
            <Money value={totalBalance} />
          </div>
          <div className="row">
            <div className="pill">
              <small>Parcelas por mês</small>
              <b>
                <Money value={monthly} />
              </b>
            </div>
            <div className="pill">
              <small>Falta pagar (total)</small>
              <b>
                <Money value={totalRemaining} />
              </b>
            </div>
          </div>
        </div>
      )}
      <div className="spacer" />
      {list.filter((x) => x.s.remainingCount > 0).length > 1 && (
        <button className="btn secondary" style={{ marginBottom: 10 }} onClick={() => navigate('amortizar')}>
          ⚖️ Onde amortizar? Comparar financiamentos
        </button>
      )}
      {list.length ? (
        list.map(({ f, s }) => (
          <div key={f.id} className="card" role="button" onClick={() => navigate('financiamentos/' + f.id)} style={{ cursor: 'pointer' }}>
            <div className="between">
              <div className="row">
                <span style={{ fontSize: 26 }}>{TYPE_ICON[f.type]}</span>
                <div>
                  <div className="bold">{f.name}</div>
                  <div className="tiny muted">
                    {f.institution || 'Instituição'} · {s.paidCount}/{s.resolved.n} parcelas
                  </div>
                </div>
              </div>
              {s.remainingCount === 0 ? <span className="badge pos">Quitado 🎉</span> : <span className="badge info">{s.remainingCount} restantes</span>}
            </div>
            <div style={{ margin: '12px 0 8px' }}>
              <Progress pct={s.pctPaid} tone="pos" />
            </div>
            <div className="between small">
              <span className="muted">{Math.round(s.pctPaid * 100)}% pago</span>
              <span>
                Saldo devedor <b><Money value={s.balance} /></b>
              </span>
            </div>
            {s.nextInstallment && (
              <div className="between small" style={{ marginTop: 4 }}>
                <span className="muted">Próxima: {fmtDate(s.nextInstallment.date)}</span>
                <b>
                  <Money value={s.nextInstallment.payment} />
                </b>
              </div>
            )}
          </div>
        ))
      ) : (
        <div className="card">
          <Empty
            icon="🏦"
            title="Nenhum financiamento"
            text="Cadastre veículo, imóvel ou empréstimo e o app cria o cronograma completo, calcula juros e simula antecipações."
            action="+ Novo financiamento"
            onAction={() => openForm({ type: 'financiamento' })}
          />
        </div>
      )}
    </div>
  )
}

type Tab = 'resumo' | 'cronograma' | 'evolucao' | 'simulador'

export function FinancingDetail({ id, initialTab }: { id: string; initialTab?: Tab }) {
  const data = useData()
  const f = data.financings.find((x) => x.id === id)
  const [tab, setTab] = useState<Tab>(initialTab ?? 'resumo')
  const s = useMemo(() => (f ? summarizeFinancing(f) : null), [f])
  if (!f || !s) return <div className="screen"><TopBar title="Não encontrado" showBack /></div>
  const txs = data.transactions.filter((t) => t.source.type === 'financing' && t.source.id === f.id)
  const txByK = new Map(txs.map((t) => [t.installment?.n ?? 0, t]))
  const next = s.nextInstallment ? txByK.get(s.nextInstallment.k) : undefined

  return (
    <div className="screen">
      <TopBar
        title={f.name}
        sub={[f.institution, f.asset].filter(Boolean).join(' · ')}
        showBack
        right={
          <button className="icon-btn" onClick={() => openForm({ type: 'financiamento', id: f.id })} aria-label="Editar">
            ✏️
          </button>
        }
      />
      <Seg
        options={[
          { value: 'resumo', label: 'Resumo' },
          { value: 'cronograma', label: 'Parcelas' },
          { value: 'evolucao', label: 'Evolução' },
          { value: 'simulador', label: 'Simular' },
        ]}
        value={tab}
        onChange={setTab}
      />
      <div className="spacer" />

      {tab === 'resumo' && (
        <>
          <div className="card">
            <div className="between">
              <span className="muted small">Saldo devedor {s.balanceSource === 'informado' ? '(informado pelo banco)' : '(calculado)'}</span>
            </div>
            <div style={{ fontSize: 28, fontWeight: 800 }}>
              <Money value={s.balance} />
            </div>
            <div style={{ margin: '10px 0 6px' }}>
              <Progress pct={s.pctPaid} tone="pos" />
            </div>
            <div className="between small">
              <span className="pos bold">{fmtPct(s.pctPaid)} pago</span>
              <span className="muted">{fmtPct(s.pctRemaining)} restante</span>
            </div>
          </div>
          {next && s.nextInstallment && (
            <div className="card">
              <div className="between">
                <div>
                  <div className="tiny muted">Próxima parcela ({s.nextInstallment.k}/{s.resolved.n})</div>
                  <div className="bold" style={{ fontSize: 18 }}>
                    <Money value={s.nextInstallment.payment} />
                  </div>
                  <div className="tiny muted">Vence {fmtDate(s.nextInstallment.date)}</div>
                </div>
                <button
                  className="btn sm"
                  onClick={() => {
                    actions.setPaid(next.id, true)
                    toast(`Parcela ${s.nextInstallment!.k} marcada como paga`)
                  }}
                >
                  ✓ Paguei
                </button>
              </div>
            </div>
          )}
          <div className="card">
            <KV k="Valor financiado" v={fmtBRL(s.resolved.principal)} />
            {f.assetValue ? <KV k="Valor do bem" v={fmtBRL(f.assetValue)} /> : null}
            {f.downPayment ? <KV k="Entrada" v={fmtBRL(f.downPayment)} /> : null}
            <KV k="Taxa de juros" v={`${fmtPct(s.resolved.rate, 2)} a.m. · ${fmtPct(s.resolved.annualRate, 2)} a.a.${s.resolved.rateEstimated ? ' (estimada)' : ''}`} />
            <KV k="Sistema" v={s.resolved.system === 'SAC' ? 'SAC' : `Price${s.resolved.systemAssumed ? ' (assumido)' : ''}`} />
            {s.resolved.fees > 0 && <KV k="Seguros e taxas por mês" v={fmtBRL(s.resolved.fees)} />}
            <KV k="Parcelas" v={`${s.paidCount} pagas · ${s.remainingCount} restantes`} />
            <KV k="1ª / última parcela" v={`${fmtDate(s.schedule[0]?.date)} → ${fmtDate(s.schedule[s.schedule.length - 1]?.date)}`} />
            <KV k={`Total já pago${s.balanceSource === 'informado' ? ' (estimado)' : ''}`} v={<span className="pos">{fmtBRL(s.totalPaid)}</span>} />
            <KV k="Total que falta pagar" v={fmtBRL(s.totalRemaining)} />
            <KV k={`Juros já pagos${s.balanceSource === 'informado' ? ' (estimado)' : ''}`} v={fmtBRL(s.interestPaid)} />
            <KV k="Juros futuros" v={fmtBRL(s.interestRemaining)} />
            <KV k="Total de juros estimado" v={<span className="neg">{fmtBRL(s.totalInterest)}</span>} />
            <KV k="Custo total" v={fmtBRL(s.totalCost)} total />
            <KV k="Quitação estimada" v={s.payoffDate ? monthLabel(s.payoffDate.slice(0, 7)) : 'Quitado'} />
          </div>
          {s.resolved.warnings.map((w) => (
            <div key={w} className="note warn" style={{ marginTop: 10 }}>
              {w}
            </div>
          ))}
          {f.note && <div className="note">{f.note}</div>}
        </>
      )}

      {tab === 'cronograma' && (
        <div className="card">
          <div className="small muted" style={{ marginBottom: 8 }}>
            Toque em uma linha para marcar/desmarcar como paga.
          </div>
          <div className="table-wrap">
            <table className="t num">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Vencimento</th>
                  <th>Parcela</th>
                  <th>Juros</th>
                  <th>Amortiz.</th>
                  <th>Saldo</th>
                </tr>
              </thead>
              <tbody>
                {s.schedule.map((r) => {
                  const t = txByK.get(r.k)
                  const paid = t?.paid
                  return (
                    <tr
                      key={r.k}
                      className={paid ? 'done' : r.k === s.nextInstallment?.k ? 'next' : ''}
                      onClick={() => t && actions.setPaid(t.id, !t.paid)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td>{paid ? '✓' : r.k}</td>
                      <td>{fmtDate(r.date)}</td>
                      <td>{fmtBRL(t?.amount ?? r.payment)}</td>
                      <td>{fmtBRL(r.interest)}</td>
                      <td>{fmtBRL(r.amortization)}</td>
                      <td>{fmtBRL(r.balance)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'evolucao' && <Evolution s={s} />}
      {tab === 'simulador' && <Simulator f={f} s={s} />}
    </div>
  )
}

function Evolution({ s }: { s: ReturnType<typeof summarizeFinancing> }) {
  // agrupa por ano
  const years = new Map<string, { paid: number; interest: number; amort: number; balance: number }>()
  for (const r of s.schedule) {
    const y = r.date.slice(0, 4)
    const cur = years.get(y) ?? { paid: 0, interest: 0, amort: 0, balance: 0 }
    cur.paid += r.payment
    cur.interest += r.interest
    cur.amort += r.amortization
    cur.balance = r.balance
    years.set(y, cur)
  }
  const step = Math.max(1, Math.ceil(s.schedule.length / 12))
  const pts = [{ label: 'Início', value: s.resolved.principal, projected: false }]
  for (let i = step - 1; i < s.schedule.length; i += step) {
    const r = s.schedule[i]
    pts.push({ label: monthLabel(r.date.slice(0, 7), true), value: r.balance, projected: r.k > s.paidCount })
  }
  if (pts[pts.length - 1].value !== 0) {
    const last = s.schedule[s.schedule.length - 1]
    pts.push({ label: monthLabel(last.date.slice(0, 7), true), value: 0, projected: true })
  }
  return (
    <>
      <div className="card">
        <h3>Saldo devedor ao longo do tempo</h3>
        <LineChart points={pts} label="Saldo devedor" projectedLabel="A pagar" />
      </div>
      <Section title="Mês a mês, por ano" />
      <div className="card">
        <div className="table-wrap">
          <table className="t num">
            <thead>
              <tr>
                <th>Ano</th>
                <th>Pago</th>
                <th>Juros</th>
                <th>Amortização</th>
                <th>Saldo final</th>
              </tr>
            </thead>
            <tbody>
              {[...years.entries()].map(([y, v]) => (
                <tr key={y}>
                  <td>{y}</td>
                  <td>{fmtBRL(v.paid)}</td>
                  <td>{fmtBRL(v.interest)}</td>
                  <td>{fmtBRL(v.amort)}</td>
                  <td>{fmtBRL(v.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

type SimMode = 'antecipar' | 'mensal' | 'extra'

function Simulator({ f, s }: { f: Financing; s: ReturnType<typeof summarizeFinancing> }) {
  const base = loanStateFrom(s)
  const [mode, setMode] = useState<SimMode>('antecipar')
  const [value, setValue] = useState<number | undefined>()
  const [custom, setCustom] = useState(false)
  const [cBalance, setCBalance] = useState<number | undefined>(round2(base.balance))
  const [cRate, setCRate] = useState<number | undefined>(round2(base.rate * 1000000) / 10000)
  const [cRemaining, setCRemaining] = useState<number | undefined>(base.remaining)

  if (s.remainingCount === 0) return <div className="card"><Empty icon="🎉" title="Financiamento quitado" /></div>

  let st: LoanState = base
  if (custom && cBalance && cRemaining) {
    const rate = (cRate ?? 0) / 100
    st = {
      ...base,
      balance: cBalance,
      rate,
      remaining: cRemaining,
      payment: pmt(cBalance, rate, cRemaining),
      amortization: cBalance / cRemaining,
    }
  }
  const lowConfidence = !custom && (s.resolved.rateEstimated || s.resolved.systemAssumed || s.balanceSource === 'calculado')
  const v = value ?? 0
  const anchor = Number(st.nextDate.slice(8, 10))
  const origEnd = addMonths(st.nextDate, st.remaining - 1, anchor)

  return (
    <>
      <div className={`note ${lowConfidence ? 'warn' : ''}`}>
        {lowConfidence ? (
          <>
            <b>Isto é uma simulação.</b> O saldo devedor foi calculado pelo app
            {s.resolved.rateEstimated ? ' e a taxa foi estimada' : ''}. Para um valor real de quitação, peça ao banco o saldo devedor atualizado e informe abaixo.
          </>
        ) : (
          <>Simulação com os dados informados. O valor final de quitação é sempre confirmado pela instituição (podem existir tarifas, seguros e IOF).</>
        )}
      </div>
      <button className={`toggle ${custom ? 'on' : ''}`} onClick={() => setCustom(!custom)}>
        <div>
          <div className="bold" style={{ fontSize: 15 }}>
            Usar dados fornecidos pelo banco
          </div>
          <div className="tiny muted">Saldo devedor, taxa e parcelas restantes</div>
        </div>
        <div className="sw" />
      </button>
      {custom && (
        <div className="card" style={{ marginBottom: 12 }}>
          <MoneyField label="Saldo devedor atual" value={cBalance} onChange={setCBalance} />
          <div className="two">
            <NumberField label="Juros ao mês" suffix="%" decimals value={cRate} onChange={setCRate} />
            <NumberField label="Parcelas restantes" value={cRemaining} onChange={setCRemaining} />
          </div>
          <div className="small muted">Parcela recalculada: {fmtBRL(st.system === 'PRICE' ? st.payment : st.amortization + st.balance * st.rate)}</div>
        </div>
      )}

      <Seg
        options={[
          { value: 'antecipar', label: 'Antecipar' },
          { value: 'mensal', label: 'Extra mensal' },
          { value: 'extra', label: 'Pagamento único' },
        ]}
        value={mode}
        onChange={setMode}
      />
      <div className="spacer" />
      <MoneyField
        big
        label={
          mode === 'antecipar'
            ? 'Tenho disponível para antecipar'
            : mode === 'mensal'
              ? 'Vou pagar a mais por mês'
              : 'Pagamento extraordinário de'
        }
        value={value}
        onChange={setValue}
      />

      {v > 0 && mode === 'antecipar' && <AnticipateResult st={st} v={v} origEnd={origEnd} />}
      {v > 0 && mode === 'mensal' && <ExtraMonthlyResult st={st} v={v} origEnd={origEnd} />}
      {v > 0 && mode === 'extra' && <ExtraResult st={st} v={v} origEnd={origEnd} />}
      {!v && (
        <div className="card small muted">
          {mode === 'antecipar' && 'Antecipar as últimas parcelas com desconto dos juros (direito garantido pelo Código de Defesa do Consumidor).'}
          {mode === 'mensal' && '“Se eu pagar R$ X por mês além da parcela normal, quando termino?”'}
          {mode === 'extra' && '“Se eu fizer um pagamento extraordinário de R$ X, quanto tempo economizo?”'}
        </div>
      )}
      <div className="tiny muted" style={{ marginTop: 10 }}>
        Contrato: {f.name} · saldo {fmtBRL(st.balance)} · {fmtPct(st.rate, 2)} a.m. · {st.remaining} parcelas restantes · término atual {monthLabel(origEnd.slice(0, 7))}
      </div>
    </>
  )
}

function Big({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="card stat">
      <div className="label">{label}</div>
      <div className={`value ${tone ?? ''}`}>{value}</div>
    </div>
  )
}

function lastPV(st: LoanState): number {
  const pays = futurePayments(st)
  return pays.length ? pays[pays.length - 1] / Math.pow(1 + st.rate, pays.length) : 0
}

function AnticipateResult({ st, v, origEnd }: { st: LoanState; v: number; origEnd: string }) {
  const r = anticipateLast(st, v)
  const ex = extraordinaryPayment(st, v)
  return (
    <>
      {r.count === 0 ? (
        <div className="note warn">
          O valor não cobre a última parcela. Com desconto dos juros, ela custa hoje {fmtBRL(lastPV(st))}.
        </div>
      ) : (
        <div className="note pos">
          Com <b>{fmtBRL(v)}</b> você antecipa <b>{r.count} parcela(s)</b> e economiza <b>{fmtBRL(r.interestSaved)}</b> de juros.
        </div>
      )}
      <div className="grid2">
        <Big label="Parcelas antecipadas" value={String(r.count)} />
        <Big label="Economia de juros" value={fmtBRL(r.interestSaved)} tone="pos" />
        <Big label="Valor usado" value={fmtBRL(r.amountUsed)} />
        <Big label="Abatido do saldo" value={fmtBRL(r.balanceReduction)} />
        <Big label="Novo prazo" value={`${r.newRemaining} parcelas`} />
        <Big label="Nova quitação" value={r.newPayoffDate ? monthLabel(r.newPayoffDate.slice(0, 7), true) : 'Quitado!'} tone="pos" />
      </div>
      <div className="card" style={{ marginTop: 10 }}>
        <KV k="Valor das parcelas antecipadas (sem desconto)" v={fmtBRL(r.nominal)} />
        <KV k="Sobra do valor disponível" v={fmtBRL(r.leftover)} />
        <KV k="Término atual" v={monthLabel(origEnd.slice(0, 7))} />
      </div>
      <Section title="Outras possibilidades com o mesmo valor" />
      <div className="card">
        <KV k="Amortizar e reduzir o prazo" v={`−${ex.monthsSaved} meses · economia ${fmtBRL(ex.interestSavedTerm)}`} />
        <KV k="Amortizar e reduzir a parcela" v={`nova parcela ${fmtBRL(ex.newPayment)} · economia ${fmtBRL(ex.interestSavedPayment)}`} />
        <div className="tiny muted" style={{ marginTop: 6 }}>
          Reduzir o prazo costuma economizar mais juros; reduzir a parcela alivia o orçamento mensal.
        </div>
      </div>
    </>
  )
}

function ExtraMonthlyResult({ st, v, origEnd }: { st: LoanState; v: number; origEnd: string }) {
  const r = extraMonthly(st, v)
  return (
    <>
      <div className="note pos">
        Pagando <b>{fmtBRL(v)}</b> a mais por mês, você termina em <b>{r.withExtra.endDate ? monthLabel(r.withExtra.endDate.slice(0, 7)) : '—'}</b>, <b>{r.monthsSaved} meses</b> antes.
      </div>
      <div className="grid2">
        <Big label="Meses até quitar" value={`${r.withExtra.months}`} />
        <Big label="Meses economizados" value={`${r.monthsSaved}`} tone="pos" />
        <Big label="Economia de juros" value={fmtBRL(r.interestSaved)} tone="pos" />
        <Big label="Nova quitação" value={r.withExtra.endDate ? monthLabel(r.withExtra.endDate.slice(0, 7), true) : '—'} />
      </div>
      <div className="card" style={{ marginTop: 10 }}>
        <KV k="Término atual" v={monthLabel(origEnd.slice(0, 7))} />
        <KV k="Juros futuros sem extra" v={fmtBRL(r.base.totalInterest)} />
        <KV k="Juros futuros com extra" v={fmtBRL(r.withExtra.totalInterest)} />
        <KV k="Total a desembolsar" v={fmtBRL(r.withExtra.totalPaid)} />
      </div>
    </>
  )
}

function ExtraResult({ st, v, origEnd }: { st: LoanState; v: number; origEnd: string }) {
  const r = extraordinaryPayment(st, v)
  return (
    <>
      {r.newBalance === 0 ? (
        <div className="note pos">
          Esse valor quita o saldo devedor estimado de <b>{fmtBRL(st.balance)}</b>. 🎉
        </div>
      ) : (
        <div className="note pos">
          Abatendo <b>{fmtBRL(v)}</b> hoje e mantendo a parcela, você economiza <b>{r.monthsSaved} meses</b> e <b>{fmtBRL(r.interestSavedTerm)}</b> de juros.
        </div>
      )}
      <Section title="Opção 1 — reduzir o prazo" />
      <div className="grid2">
        <Big label="Tempo economizado" value={`${r.monthsSaved} meses`} tone="pos" />
        <Big label="Economia de juros" value={fmtBRL(r.interestSavedTerm)} tone="pos" />
        <Big label="Novo saldo devedor" value={fmtBRL(r.newBalance)} />
        <Big label="Nova quitação" value={r.reducedTerm.endDate ? monthLabel(r.reducedTerm.endDate.slice(0, 7), true) : 'Quitado!'} />
      </div>
      <Section title="Opção 2 — reduzir a parcela" />
      <div className="grid2">
        <Big label="Nova parcela" value={fmtBRL(r.newPayment)} />
        <Big label="Economia de juros" value={fmtBRL(r.interestSavedPayment)} tone="pos" />
      </div>
      <div className="tiny muted" style={{ marginTop: 10 }}>
        Término atual: {monthLabel(origEnd.slice(0, 7))}.
      </div>
    </>
  )
}
