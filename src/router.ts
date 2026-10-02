// Roteador mínimo baseado em hash (#/financiamentos/abc). Funciona offline e com o botão "voltar" do Android.
import { useSyncExternalStore } from 'react'

function current(): string[] {
  const h = location.hash.replace(/^#\/?/, '')
  return h ? h.split('/').map(decodeURIComponent) : ['inicio']
}

let route = current()
const subs = new Set<() => void>()
window.addEventListener('hashchange', () => {
  route = current()
  window.scrollTo(0, 0)
  subs.forEach((s) => s())
})

export function useRoute(): string[] {
  return useSyncExternalStore(
    (l) => {
      subs.add(l)
      return () => subs.delete(l)
    },
    () => route,
  )
}

export function navigate(path: string) {
  const target = '#/' + path
  if (location.hash !== target) location.hash = target
}

export function back() {
  if (history.length > 1) history.back()
  else navigate('inicio')
}
