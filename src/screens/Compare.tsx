// "Onde amortizar": compara todos os financiamentos para um valor disponível.
import { useState } from 'react'
import { actions, useData } from '../store'
import { Empty, KV, MoneyField, NumberField, Seg, TopBar, askText, openForm, toast } from '../components/ui'
import { navigate } from '../router'
import { monthLabel } from '../lib/dates'
import { fmtBRL, fmtPct } from '../lib/money'
import { compareAmortization, type AmortOption } from '../lib/compare'
import { reserveValue } from '../lib/projections'

const ICON: Record<string, string> = { veiculo: '🚗', imovel: '🏠', equipamento: '🛠️', emprestimo: '💵', outros: '📦' }
const LS_KEY = 'minhas-financas:comparar'

function loadPrefs(): { amount?: number; invest?: number; goal?: 'prazo' | 'parcela' } {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? '{}')
  } catch {
    return {}
  }
}
function savePrefs(p: object) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(p))
  } catch {
    /* sem armazenamento: só não lembra */
  }
}

export function Compare() {
  const data = useData()
  const prefs = loadPrefs()
  const [amount, setAmount] = useState<number | undefined>(prefs.amount ?? 3000)
  const [goal, setGoal] = useState<'prazo' | 'parcela'>(prefs.goal ?? 'parcela')
  const [invest, setInvest] = useState<number | undefined>(prefs.invest ?? 0.85)
  const update = (p: Partial<{ amount?: number; invest?: number; goal: 'prazo' | 'parcela' }>) => savePrefs({ amount, invest, goal, ...p })

  const v = amount ?? 0
  const options = v > 0 ? compareAmortization(data.financings, v) : []
  const best = options[0]
  const investRate = (invest ?? 0) / 100
  const reserve = reserveValue(data)

  const setIndex = async (o: AmortOption) => {
    const f = data.financings.find((x) => x.id === o.id)
    if (!f) return
    const t = await askText(`${o.name}: correção do saldo ao mês (%). Ex.: IPCA ≈ 0,35`, o.indexMonthly ? String(o.indexMonthly * 100).replace('.', ',') : '0,35', { numeric: false })
    if (t == null) return
    const n = Number(t.replace(',', '.'))
    if (!Number.isFinite(n) || n < 0 || n > 5) return toast('Valor inválido')
    actions.saveFinancing({ ...f, indexMonthly: n / 100 })
    toast('Correção salva')
  }

  if (!data.financings.length)
    return (
      <div className="screen">
        <TopBar title="Onde amortizar" showBack />
        <div className="card">
          <Empty icon="⚖️" title="Nenhum financiamento cadastrado" text="Cadastre seus financiamentos e empréstimos para comparar onde vale mais a pena amortizar." action="+ Novo financiamento" onAction={() => openForm({ type: 'financiamento' })} />
        </div>
      </div>
    )

  return (
    <div className="screen">
      <TopBar title="Onde amortizar" sub="Compare seus financiamentos" showBack />

      <MoneyField
        big
        label="Tenho disponível para amortizar"
        value={amount}
        onChange={(x) => {
          setAmount(x)
          update({ amount: x })
        }}
      />
      <Seg
        options={[
          { value: 'parcela', label: 'Reduzir a parcela' },
          { value: 'prazo', label: 'Reduzir o prazo' },
        ]}
        value={goal}
        onChange={(g) => {
          setGoal(g)
          update({ goal: g })
        }}
      />
      <div className="spacer" />

      {best && (
        <div className="note pos">
          🏆 <b>Melhor opção: {best.name}.</b> É a dívida mais cara ({fmtPct(best.monthlyCost, 2)} ao mês): cada R$ 1.000 abatidos deixam de pagar cerca de{' '}
          <b>{fmtBRL(best.monthlyCost * 1000)} por mês</b>.
          {goal === 'parcela' && !best.paysOff && (
            <>
              {' '}
              A parcela cai <b>{fmtBRL(best.monthlyRelief)}</b> por mês.
            </>
          )}
          {goal === 'prazo' && !best.paysOff && (
            <>
              {' '}
              Você termina <b>{best.monthsSaved} {best.monthsSaved === 1 ? 'mês' : 'meses'}</b> antes.
            </>
          )}
          {best.paysOff && <> Esse valor quita o contrato.</>}
        </div>
      )}

      {options.map((o, i) => {
        const beatsInvest = o.monthlyCost > investRate
        return (
          <div key={o.id} className="card" style={i === 0 ? { borderColor: 'var(--pos)', borderWidth: 2 } : undefined}>
            <div className="between">
              <div className="row" style={{ minWidth: 0 }}>
                <span style={{ fontSize: 24 }}>{ICON[o.type] ?? '🏦'}</span>
                <div style={{ minWidth: 0 }}>
                  <div className="bold">
                    {i + 1}º {o.name}
                  </div>
                  <div className="tiny muted">
                    {[o.institution, `saldo ${fmtBRL(o.balance)}`, `${o.remaining} parcelas`].filter(Boolean).join(' · ')}
                  </div>
                </div>
              </div>
              <span className={`badge ${i === 0 ? 'pos' : beatsInvest ? 'info' : 'warn'}`}>
                {fmtPct(o.monthlyCost, 2)} a.m.
              </span>
            </div>
            <div className="divider" />
            {o.paysOff ? (
              <>
                <KV k="Resultado" v={<b className="pos">Quita o contrato</b>} />
                {o.leftover > 0 && <KV k="Sobra" v={fmtBRL(o.leftover)} />}
              </>
            ) : goal === 'parcela' ? (
              <>
                <KV k="Parcela" v={<>{fmtBRL(o.currentPayment)} → <b>{fmtBRL(o.newPayment)}</b></>} />
                <KV k="Sobra a mais por mês" v={<b className="pos">{fmtBRL(o.monthlyRelief)}</b>} />
                <KV k="Juros que deixa de pagar" v={fmtBRL(o.interestSavedPayment)} />
              </>
            ) : (
              <>
                <KV k="Termina" v={<>{o.endDate ? monthLabel(o.endDate.slice(0, 7), true) : '—'} → <b>{o.newEndDate ? monthLabel(o.newEndDate.slice(0, 7), true) : '—'}</b></>} />
                <KV k="Meses a menos" v={<b className="pos">{o.monthsSaved}</b>} />
                <KV k="Juros que deixa de pagar" v={fmtBRL(o.interestSavedTerm)} />
              </>
            )}
            <KV k="Rende o equivalente a" v={`${fmtPct(o.annualCost, 1)} ao ano`} />
            <div className="tiny muted" style={{ marginTop: 6 }}>
              {beatsInvest
                ? `Amortizar aqui rende mais que a aplicação de ${fmtPct(investRate, 2)} ao mês.`
                : `A aplicação de ${fmtPct(investRate, 2)} ao mês rende mais que amortizar aqui.`}
              {o.estimated && ' Valores estimados: informe o saldo devedor do banco no cadastro.'}
            </div>
            <div className="btn-row" style={{ marginTop: 10 }}>
              <button className="btn secondary sm" onClick={() => navigate(`financiamentos/${o.id}/simular`)}>
                Simular em detalhe
              </button>
              {(o.type === 'imovel' || o.indexMonthly > 0) && (
                <button className="btn ghost sm" onClick={() => setIndex(o)}>
                  {o.indexMonthly > 0 ? `Correção ${fmtPct(o.indexMonthly, 2)}` : '+ Correção IPCA/TR'}
                </button>
              )}
            </div>
          </div>
        )
      })}

      {reserve <= 0 && (
        <div className="note warn" style={{ marginTop: 10 }}>
          🛟 Sua reserva de emergência está zerada. Dinheiro usado para amortizar não volta para o caixa: considere guardar uma parte antes.
        </div>
      )}

      <div className="card" style={{ marginTop: 10 }}>
        <h3>Como a comparação funciona</h3>
        <div className="small muted">
          Amortizar uma dívida rende exatamente o custo dela: cada real abatido deixa de pagar a taxa do contrato (mais a correção do saldo, quando houver IPCA ou TR). Por isso a ordem é pelo custo ao mês. Um contrato longo, como o de imóvel, mostra uma economia total maior em reais, mas ela acontece muitos anos à frente e vale menos hoje.
        </div>
        <div className="spacer" />
        <NumberField
          label="Uma aplicação rende"
          suffix="% ao mês"
          decimals
          value={invest}
          onChange={(x) => {
            setInvest(x)
            update({ invest: x })
          }}
          hint="Para comparar com investir o dinheiro. Ex.: CDB, poupança, Tesouro (já descontado o imposto)."
        />
      </div>
    </div>
  )
}
