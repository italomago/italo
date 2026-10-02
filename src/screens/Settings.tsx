// Ajustes: segurança (PIN/biometria), backup e restauração, alertas, categorias e tema.
import { useEffect, useRef, useState } from 'react'
import { actions, getData, useData } from '../store'
import { askConfirm, askText, Field, openForm, NumberField, Section, Seg, TopBar, Toggle, toast } from '../components/ui'
import { biometricAvailable, checkPin, hashPin, makeBackup, readBackup, registerBiometric, verifyBiometric, type BackupFile } from '../lib/security'
import { shareFile, transactionsCSV, downloadFile } from '../lib/export'
import { uid } from '../lib/defaults'
import type { AlertSettings } from '../lib/types'

export function Settings() {
  const data = useData()
  const s = data.settings
  const [bioOk, setBioOk] = useState(false)
  const [backupPass, setBackupPass] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    biometricAvailable().then(setBioOk)
  }, [])

  const setPin = async () => {
    const p1 = await askText('Crie um PIN de 4 a 8 números', '', { secret: true, numeric: true })
    if (!p1) return
    if (!/^\d{4,8}$/.test(p1)) return toast('O PIN deve ter de 4 a 8 números')
    const p2 = await askText('Repita o PIN', '', { secret: true, numeric: true })
    if (p1 !== p2) return toast('Os PINs não conferem')
    const { hash, salt } = await hashPin(p1)
    actions.updateSettings({ pinHash: hash, pinSalt: salt, pinLength: p1.length, lockOnStart: true })
    toast('PIN definido 🔒')
  }
  const removePin = async () => {
    const p = await askText('Digite o PIN atual para remover', '', { secret: true, numeric: true })
    if (!p || !s.pinHash || !s.pinSalt) return
    if (!(await checkPin(p, s.pinHash, s.pinSalt))) return toast('PIN incorreto')
    actions.updateSettings({ pinHash: undefined, pinSalt: undefined, biometricId: undefined, lockOnStart: false })
    toast('Bloqueio removido')
  }
  const toggleBio = async (on: boolean) => {
    if (!on) return actions.updateSettings({ biometricId: undefined })
    if (!s.pinHash) return toast('Defina um PIN primeiro (usado como alternativa)')
    try {
      const id = await registerBiometric()
      if (await verifyBiometric(id)) {
        actions.updateSettings({ biometricId: id })
        toast('Biometria ativada')
      }
    } catch (e) {
      toast('Não foi possível ativar: ' + (e as Error).message)
    }
  }

  const doBackup = async (send: boolean) => {
    const file = await makeBackup(getData(), backupPass || undefined)
    const name = `minhas-financas-backup-${new Date().toISOString().slice(0, 10)}.json`
    const content = JSON.stringify(file)
    try {
      if (send) {
        const r = await shareFile(name, content, 'application/json', 'Backup do app Minhas Finanças')
        if (r === 'downloaded' && s.email) {
          // sem compartilhamento nativo: abre o e-mail para anexar o arquivo baixado
          window.location.href = `mailto:${encodeURIComponent(s.email)}?subject=${encodeURIComponent('Backup Minhas Finanças ' + new Date().toLocaleDateString('pt-BR'))}&body=${encodeURIComponent('Anexe o arquivo ' + name + ' que acabou de ser baixado.')}`
        }
      } else downloadFile(name, content, 'application/json')
      actions.updateSettings({ lastBackup: Date.now() })
      toast('Backup gerado ✔')
    } catch {
      /* cancelado pelo usuário */
    }
  }

  const copyBackup = async () => {
    const file = await makeBackup(getData(), backupPass || undefined)
    try {
      await navigator.clipboard.writeText(JSON.stringify(file))
      actions.updateSettings({ lastBackup: Date.now() })
      toast('Backup copiado. Cole num e-mail para você mesmo ou numa nota segura.')
    } catch {
      toast('Não foi possível copiar neste navegador')
    }
  }

  const restoreText = async () => {
    const t = await askText('Cole aqui o texto do backup')
    if (t) await restoreJSON(t)
  }

  const restore = async (f: File) => restoreJSON(await f.text())

  const restoreJSON = async (json: string) => {
    try {
      const file = JSON.parse(json) as BackupFile
      let pass: string | undefined
      if (file.encrypted) pass = await askText('Senha do backup', '', { secret: true }) ?? undefined
      const raw = await readBackup(file, pass)
      if (!await askConfirm('Substituir TODOS os dados deste aparelho pelos do backup?', { danger: true, okLabel: 'Substituir' })) return
      actions.importData(raw)
      toast('Dados restaurados ✔')
    } catch (e) {
      toast((e as Error).message || 'Arquivo inválido')
    }
  }

  const setAlert = <K extends keyof AlertSettings>(k: K, v: AlertSettings[K]) => actions.updateSettings({ alerts: { ...s.alerts, [k]: v } })

  const askNotif = async (on: boolean) => {
    if (on && 'Notification' in window) {
      const p = await Notification.requestPermission()
      if (p !== 'granted') return toast('Permissão de notificação negada')
    } else if (on) return toast('Este navegador não suporta notificações')
    actions.updateSettings({ notifications: on })
  }

  return (
    <div className="screen">
      <TopBar title="Ajustes e backup" showBack />

      <Section title="Segurança e privacidade" />
      {s.pinHash ? (
        <>
          <Toggle label="Pedir PIN ao abrir" value={s.lockOnStart} onChange={(v) => actions.updateSettings({ lockOnStart: v })} />
          {bioOk && <Toggle label="Face ID / biometria" sub="Desbloqueio pelo rosto ou digital do aparelho" value={!!s.biometricId} onChange={toggleBio} />}
          <div className="btn-row">
            <button className="btn secondary" onClick={setPin}>
              Trocar PIN
            </button>
            <button className="btn danger" onClick={removePin}>
              Remover PIN
            </button>
          </div>
        </>
      ) : (
        <button className="btn" onClick={setPin}>
          🔒 Criar PIN de acesso
        </button>
      )}
      {!bioOk && s.pinHash && <div className="tiny muted" style={{ marginTop: 6 }}>Biometria indisponível neste navegador/aparelho.</div>}
      <div className="spacer" />
      <Toggle label="Ocultar valores" sub="Esconde os valores na tela (toque no 👁️ do início)" value={s.hideValues} onChange={(v) => actions.updateSettings({ hideValues: v })} />

      <Section title="Backup e recuperação" />
      <div className="note">
        Seus dados ficam <b>somente neste aparelho</b>. Para não perder nada se trocar ou perder o celular, envie um backup para o seu e-mail (ou Drive/iCloud) com frequência.
        {s.lastBackup && (
          <>
            <br />
            Último backup: <b>{new Date(s.lastBackup).toLocaleString('pt-BR')}</b>
          </>
        )}
      </div>
      <Field label="Seu e-mail para backups (opcional)">
        <input type="email" value={s.email ?? ''} onChange={(e) => actions.updateSettings({ email: e.target.value })} placeholder="voce@email.com" />
      </Field>
      <Field label="Senha do backup (recomendado)" hint="O arquivo é criptografado (AES-256). Sem a senha não é possível restaurar — guarde-a bem.">
        <input type="password" value={backupPass} onChange={(e) => setBackupPass(e.target.value)} placeholder="Deixe em branco para não criptografar" autoComplete="new-password" />
      </Field>
      <div className="stack">
        <button className="btn" onClick={() => doBackup(true)}>
          📧 Enviar backup (e-mail, Drive, iCloud…)
        </button>
        <button className="btn secondary" onClick={() => doBackup(false)}>
          💾 Baixar arquivo de backup
        </button>
        <button className="btn secondary" onClick={copyBackup}>
          📋 Copiar backup como texto
        </button>
        <button className="btn secondary" onClick={() => fileRef.current?.click()}>
          ♻️ Restaurar de um arquivo
        </button>
        <button className="btn secondary" onClick={restoreText}>
          📋 Restaurar colando o texto
        </button>
        <button className="btn secondary" onClick={() => openForm({ type: 'importar' })}>
          📥 Importar cadastro (adiciona, não apaga)
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) restore(f)
            e.target.value = ''
          }}
        />
        <button className="btn secondary" onClick={() => downloadFile('todos-os-lancamentos.csv', transactionsCSV(data), 'text/csv;charset=utf-8')}>
          📗 Exportar para Excel (CSV)
        </button>
      </div>

      <Section title="Alertas" />
      <Toggle label="Notificações do aparelho" sub="Avisa ao abrir o app sobre contas e faturas" value={s.notifications} onChange={askNotif} />
      <Toggle label="Conta vencendo" value={s.alerts.bills} onChange={(v) => setAlert('bills', v)} />
      <Toggle label="Parcela vencendo" value={s.alerts.installments} onChange={(v) => setAlert('installments', v)} />
      <Toggle label="Fatura próxima do vencimento" value={s.alerts.invoices} onChange={(v) => setAlert('invoices', v)} />
      <Toggle label="Limite do cartão próximo do máximo" value={s.alerts.cardLimit} onChange={(v) => setAlert('cardLimit', v)} />
      <Toggle label="Meta próxima de ser atingida" value={s.alerts.goals} onChange={(v) => setAlert('goals', v)} />
      <Toggle label="Saldo projetado negativo" value={s.alerts.negativeBalance} onChange={(v) => setAlert('negativeBalance', v)} />
      <Toggle label="Financiamento chegando ao fim" value={s.alerts.financingEnd} onChange={(v) => setAlert('financingEnd', v)} />
      <Toggle label="Parcela / conta atrasada" value={s.alerts.overdue} onChange={(v) => setAlert('overdue', v)} />
      <div className="two">
        <NumberField label="Avisar com antecedência" suffix="dias" value={s.alerts.daysBefore} onChange={(v) => setAlert('daysBefore', Math.max(0, Math.min(30, v ?? 3)))} />
        <NumberField label="Alerta de limite em" suffix="%" value={Math.round(s.alerts.cardLimitPct * 100)} onChange={(v) => setAlert('cardLimitPct', Math.max(10, Math.min(100, v ?? 80)) / 100)} />
      </div>

      <Section title="Categorias" />
      <CategoriesEditor />

      <Section title="Aparência" />
      <Seg
        options={[
          { value: 'auto', label: 'Automático' },
          { value: 'claro', label: 'Claro' },
          { value: 'escuro', label: 'Escuro' },
        ]}
        value={s.theme}
        onChange={(v) => actions.updateSettings({ theme: v })}
      />

      <Section title="Zona de perigo" />
      <button
        className="btn danger"
        onClick={async () => {
          if (await askConfirm('Apagar TODOS os dados deste aparelho? Faça um backup antes.', { danger: true, okLabel: 'Apagar' }) && await askConfirm('Tem certeza? Esta ação não pode ser desfeita.', { danger: true, okLabel: 'Apagar tudo' })) {
            actions.resetAll()
            toast('Dados apagados')
          }
        }}
      >
        Apagar todos os dados
      </button>
      <div className="tiny muted center" style={{ marginTop: 18 }}>
        Minhas Finanças · uso pessoal e privado · v1.0
      </div>
    </div>
  )
}

function CategoriesEditor() {
  const data = useData()
  const [kind, setKind] = useState<'out' | 'in'>('out')
  const cats = data.categories.filter((c) => c.kind === kind)
  const used = new Set(data.transactions.map((t) => t.categoryId))
  return (
    <>
      <Seg
        tone={kind}
        options={[
          { value: 'out', label: 'Saídas' },
          { value: 'in', label: 'Entradas' },
        ]}
        value={kind}
        onChange={setKind}
      />
      <div className="spacer" />
      <div className="card tight">
        {cats.map((c) => (
          <div key={c.id} className="list-item">
            <button
              className="ic"
              style={{ border: 'none' }}
              onClick={async () => {
                const icon = await askText('Emoji da categoria', c.icon)
                if (icon) actions.saveCategory({ ...c, icon: icon.trim().slice(0, 4) })
              }}
            >
              {c.icon}
            </button>
            <div className="main">
              <div className="title">{c.name}</div>
              <div className="meta">{c.subs.join(', ') || 'Sem subcategorias'}</div>
            </div>
            <div className="end row">
              <button
                className="badge"
                style={{ border: 'none' }}
                onClick={async () => {
                  const name = await askText('Nome da categoria', c.name)
                  if (name?.trim()) actions.saveCategory({ ...c, name: name.trim() })
                }}
              >
                editar
              </button>
              {!used.has(c.id) && (
                <button className="badge neg" style={{ border: 'none' }} onClick={async () => await askConfirm(`Excluir “${c.name}”?`) && actions.deleteCategory(c.id)}>
                  ✕
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="spacer" />
      <button
        className="btn secondary"
        onClick={async () => {
          const name = await askText('Nome da nova categoria')
          if (name?.trim()) actions.saveCategory({ id: uid(), name: name.trim(), kind, icon: kind === 'in' ? '💰' : '🏷️', color: '#64748b', subs: [] })
        }}
      >
        + Nova categoria
      </button>
      <div className="spacer" />
      <ListEditor list="origins" title="Origens de entrada" />
      <ListEditor list="platforms" title="Plataformas / lojas" />
      <ListEditor list="methods" title="Formas de pagamento" />
    </>
  )
}

function ListEditor({ list, title }: { list: 'origins' | 'methods' | 'platforms'; title: string }) {
  const data = useData()
  const locked = list === 'methods' ? ['Crédito'] : []
  return (
    <div className="card" style={{ marginTop: 10 }}>
      <h3>{title}</h3>
      <div className="picker" style={{ marginBottom: 0 }}>
        {data[list].map((v) => (
          <button key={v} onClick={async () => !locked.includes(v) && await askConfirm(`Remover “${v}”?`) && actions.removeFromList(list, v)}>
            {v} {!locked.includes(v) && <span className="muted">✕</span>}
          </button>
        ))}
        <button
          onClick={async () => {
            const v = await askText(`Adicionar em ${title.toLowerCase()}`)
            if (v) actions.addToList(list, v)
          }}
        >
          + Adicionar
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tela de bloqueio
// ---------------------------------------------------------------------------

export function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const s = useData().settings
  const [pin, setPin] = useState('')
  const [shake, setShake] = useState(false)
  const [tries, setTries] = useState(0)
  const tryBio = async () => {
    if (s.biometricId && (await verifyBiometric(s.biometricId))) onUnlock()
  }
  useEffect(() => {
    if (s.biometricId) tryBio()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const press = async (d: string) => {
    const len = s.pinLength ?? 8
    const next = (pin + d).slice(0, len)
    setPin(next)
    if (next.length >= 4 && s.pinHash && s.pinSalt && (await checkPin(next, s.pinHash, s.pinSalt))) {
      onUnlock()
    } else if (next.length === len) {
      setShake(true)
      setTries(tries + 1)
      setTimeout(() => {
        setShake(false)
        setPin('')
      }, 400)
    }
  }
  return (
    <div className="lock">
      <div style={{ fontSize: 44 }}>🔒</div>
      <div className="bold" style={{ fontSize: 20 }}>
        Minhas Finanças
      </div>
      <div className="muted small">Digite seu PIN</div>
      <div className={`pin-dots ${shake ? 'shake' : ''}`}>
        {Array.from({ length: s.pinLength ?? Math.max(4, pin.length) }, (_, i) => (
          <i key={i} className={i < pin.length ? 'on' : ''} />
        ))}
      </div>
      {tries > 0 && <div className="neg small">PIN incorreto</div>}
      <div className="keypad">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button key={d} onClick={() => press(d)}>
            {d}
          </button>
        ))}
        {s.biometricId ? (
          <button className="ghost" onClick={tryBio} aria-label="Biometria">
            🙂 Face ID
          </button>
        ) : (
          <span />
        )}
        <button onClick={() => press('0')}>0</button>
        <button className="ghost" onClick={() => setPin(pin.slice(0, -1))} aria-label="Apagar">
          ⌫
        </button>
      </div>
    </div>
  )
}
