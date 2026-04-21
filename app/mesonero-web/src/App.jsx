import { useEffect, useMemo, useState } from 'react'
import OrderWizard from './components/OrderWizard'
import { API_BASE_URL } from './config/api'
import ThemeToggle from './components/ThemeToggle'
import { useTheme } from './hooks/useTheme'

const initialOrder = {
  table: '',
  items: [],
  total: 0,
  status: 'pendiente',
}

function App() {
  const { theme, toggleTheme } = useTheme()
  const [currentOrder, setCurrentOrder] = useState(initialOrder)
  const [usuario, setUsuario] = useState('')
  const [contrasena, setContrasena] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [session, setSession] = useState(() => {
    try {
      const raw = window.localStorage.getItem('resto001:auth:mesonero')
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  })
  const apiRequestPrefix = API_BASE_URL || '/api'

  useEffect(() => {
    if (!session?.token) {
      return undefined
    }

    const originalFetch = window.fetch.bind(window)

    window.fetch = (input, init = {}) => {
      const requestUrl = typeof input === 'string' ? input : input?.url || ''
      const isApiRequest = requestUrl.startsWith(apiRequestPrefix) || requestUrl.startsWith('/api')

      if (!isApiRequest) {
        return originalFetch(input, init)
      }

      const headers = {
        ...(init.headers || {}),
        Authorization: `Bearer ${session.token}`,
      }

      return originalFetch(input, {
        ...init,
        headers,
      })
    }

    return () => {
      window.fetch = originalFetch
    }
  }, [apiRequestPrefix, session?.token])

  const canRenderApp = useMemo(
    () => Boolean(session?.token && session?.rol === 'mesonero'),
    [session?.rol, session?.token],
  )

  async function handleLogin(event) {
    event.preventDefault()
    setLoading(true)
    setError('')

    try {
      const response = await fetch(`${API_BASE_URL}/api/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          usuario,
          contrasena,
        }),
      })

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(data?.message || 'No se pudo iniciar sesion.')
      }

      if (data?.rol !== 'mesonero') {
        throw new Error('Este modulo solo permite usuarios con rol mesonero.')
      }

      const nextSession = {
        token: data.token,
        rol: data.rol,
        usuario: data.usuario,
      }

      window.localStorage.setItem('resto001:auth:mesonero', JSON.stringify(nextSession))
      setSession(nextSession)
      setContrasena('')
    } catch (loginError) {
      setError(loginError.message || 'Credenciales invalidas.')
    } finally {
      setLoading(false)
    }
  }

  function handleLogout() {
    window.localStorage.removeItem('resto001:auth:mesonero')
    setSession(null)
    setCurrentOrder(initialOrder)
    setContrasena('')
  }

  if (!canRenderApp) {
    return (
      <main className="mesonero-login flex min-h-screen items-center justify-center px-4 py-6">
        <section className="mesonero-auth-card luxury-hover-lift w-full max-w-md rounded-3xl p-6 shadow-2xl">
          <div className="flex items-start justify-between gap-4">
            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-resto-accent/80">Resto 001</p>
            <ThemeToggle theme={theme} onToggle={toggleTheme} compact />
          </div>
          <h1 className="mt-2 text-3xl font-bold text-white">Login mesonero</h1>
          <p className="mt-2 text-sm text-slate-300">Inicia sesion para acceder al panel.</p>

          <form className="mt-5 space-y-3" onSubmit={handleLogin}>
            <label className="block">
              <span className="mb-1 block text-xs uppercase tracking-[0.2em] text-slate-400">Usuario</span>
              <input
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none"
                value={usuario}
                onChange={(event) => setUsuario(event.target.value)}
                autoComplete="username"
                required
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs uppercase tracking-[0.2em] text-slate-400">Contrasena</span>
              <input
                type="password"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none"
                value={contrasena}
                onChange={(event) => setContrasena(event.target.value)}
                autoComplete="current-password"
                required
              />
            </label>

            {error ? <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p> : null}

            <button
              type="submit"
              className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-60"
              disabled={loading}
            >
              {loading ? 'Ingresando...' : 'Entrar'}
            </button>
          </form>
        </section>
      </main>
    )
  }

  return (
    <main className="mesonero-shell min-h-screen px-4 py-5 sm:px-6 lg:px-8">
      <div className="mesonero-session-bar luxury-hover-lift mx-auto mb-3 flex w-full max-w-[1200px] items-center justify-between gap-3 rounded-xl px-3 py-2 text-xs text-slate-200">
        <span>Sesion: {session?.usuario} ({session?.rol})</span>
        <div className="flex items-center gap-2">
          <ThemeToggle theme={theme} onToggle={toggleTheme} compact />
          <button type="button" className="mesonero-session-action rounded-md border border-slate-600 px-2 py-1" onClick={handleLogout}>Cerrar sesion</button>
        </div>
      </div>
      <OrderWizard
        currentOrder={currentOrder}
        setCurrentOrder={setCurrentOrder}
        initialOrder={initialOrder}
        authToken={session.token}
      />
    </main>
  )
}

export default App
