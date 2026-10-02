import { useEffect, useState } from 'react'
import { getData, useData } from './store'
import { navigate, useRoute } from './router'
import { FormHost } from './forms'
import { ToastHost, openForm } from './components/ui'
import { Dashboard } from './screens/Dashboard'
import { TxList } from './screens/TxList'
import { FinancingDetail, Financings } from './screens/Financings'
import { GoalDetail, Goals, Reserve } from './screens/Goals'
import { Accounts, CardDetail, Cards, Commitments, More, Purchases, Recurring } from './screens/Manage'
import { Alerts, Insights, Planning, Reports, Search } from './screens/Analysis'
import { LockScreen, Settings } from './screens/Settings'
import { computeAlerts } from './lib/projections'
import { today } from './lib/dates'

const TABS = [
  { path: 'inicio', icon: '🏠', label: 'Início' },
  { path: 'entradas', icon: '⬇️', label: 'Entradas' },
  { path: 'saidas', icon: '⬆️', label: 'Saídas' },
  { path: 'financiamentos', icon: '🏦', label: 'Financiam.' },
  { path: 'metas', icon: '🎯', label: 'Metas' },
  { path: 'mais', icon: '☰', label: 'Mais' },
]
const TAB_OF: Record<string, string> = {
  reserva: 'metas',
  compras: 'saidas',
  recorrentes: 'saidas',
}

function Screen({ route }: { route: string[] }) {
  const [r, id] = route
  switch (r) {
    case 'inicio':
      return <Dashboard />
    case 'entradas':
      return <TxList key="in" kind="in" />
    case 'saidas':
      return <TxList key="out" kind="out" />
    case 'financiamentos':
      return id ? <FinancingDetail id={id} /> : <Financings />
    case 'metas':
      return id ? <GoalDetail id={id} /> : <Goals />
    case 'reserva':
      return <Reserve />
    case 'mais':
      return <More />
    case 'compras':
      return <Purchases />
    case 'cartoes':
      return id ? <CardDetail id={id} /> : <Cards />
    case 'contas':
      return <Accounts />
    case 'compromissos':
      return <Commitments />
    case 'recorrentes':
      return <Recurring />
    case 'planejamento':
      return <Planning />
    case 'situacao':
      return <Insights />
    case 'alertas':
      return <Alerts />
    case 'pesquisa':
      return <Search />
    case 'relatorios':
      return <Reports />
    case 'ajustes':
      return <Settings />
    default:
      return <Dashboard />
  }
}

/** Envia notificações do aparelho para alertas importantes (uma vez por dia por alerta). */
async function notifyAlerts() {
  const d = getData()
  if (!d.settings.notifications || !('Notification' in window) || Notification.permission !== 'granted') return
  const key = 'minhas-financas:notified'
  let sent: Record<string, string> = {}
  try {
    sent = JSON.parse(localStorage.getItem(key) ?? '{}')
  } catch {
    /* ignora */
  }
  const t0 = today()
  const fresh = computeAlerts(d).filter((a) => (a.level === 'danger' || a.level === 'warning') && sent[a.id] !== t0)
  if (!fresh.length) return
  const reg = await navigator.serviceWorker?.getRegistration().catch(() => undefined)
  for (const a of fresh.slice(0, 3)) {
    const opts = { body: a.detail, tag: a.id, icon: 'icon-192.png' }
    if (reg) await reg.showNotification(a.title, opts)
    else new Notification(a.title, opts)
    sent[a.id] = t0
  }
  localStorage.setItem(key, JSON.stringify(sent))
}

export default function App() {
  const data = useData()
  const route = useRoute()
  const s = data.settings
  const [locked, setLocked] = useState(() => !!(s.pinHash && s.lockOnStart))

  // bloqueia novamente ao voltar depois de 2 minutos em segundo plano
  useEffect(() => {
    let hiddenAt = 0
    const onVis = () => {
      const st = getData().settings
      if (document.hidden) hiddenAt = Date.now()
      else if (st.pinHash && st.lockOnStart && hiddenAt && Date.now() - hiddenAt > 120000) setLocked(true)
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  useEffect(() => {
    const root = document.documentElement
    if (s.theme === 'claro') root.dataset.theme = 'light'
    else if (s.theme === 'escuro') root.dataset.theme = 'dark'
    else delete root.dataset.theme
  }, [s.theme])

  useEffect(() => {
    if (locked) return
    notifyAlerts()
    const t = setInterval(notifyAlerts, 60 * 60 * 1000)
    return () => clearInterval(t)
  }, [locked])

  if (locked) return <LockScreen onUnlock={() => setLocked(false)} />

  const tab = TAB_OF[route[0]] ?? route[0]
  return (
    <>
      <Screen route={route} />
      <button className="fab" onClick={() => openForm({ type: 'tipo' })} aria-label="Novo lançamento">
        <span>＋</span> Lançamento
      </button>
      <nav className="bottom-nav">
        {TABS.map((t) => (
          <button
            key={t.path}
            className={tab === t.path || (t.path === 'mais' && !TABS.some((x) => x.path === tab)) ? 'on' : ''}
            onClick={() => navigate(t.path)}
          >
            <span className="i">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>
      <FormHost />
      <ToastHost />
    </>
  )
}
