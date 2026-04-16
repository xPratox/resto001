import Cocina from './components/Cocina.jsx'
import { useEffect, useMemo, useState } from 'react'
import { API_BASE_URL } from './config/api'

export default function App() {
  const [usuario, setUsuario] = useState('')
  const [contrasena, setContrasena] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [session, setSession] = useState(() => {
    try {
      const raw = window.localStorage.getItem('resto001:auth:cocina')
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  })

  useEffect(() => {
    if (!session?.token) {
      return undefined
    }

    const originalFetch = window.fetch.bind(window)

    window.fetch = (input, init = {}) => {
      const requestUrl = typeof input === 'string' ? input : input?.url || ''
      const isApiRequest = requestUrl.startsWith(API_BASE_URL)

      if (!isApiRequest) {
        return originalFetch(input, init)
      }

      return originalFetch(input, {
        ...init,
        headers: {
          ...(init.headers || {}),
          Authorization: `Bearer ${session.token}`,
        },
      })
    }

    return () => {
      window.fetch = originalFetch
    }
  }, [session?.token])

  const canRenderApp = useMemo(
    () => Boolean(session?.token && session?.rol === 'cocina'),
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
        body: JSON.stringify({ usuario, contrasena }),
      })

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(data?.message || 'No se pudo iniciar sesion.')
      }

      if (data?.rol !== 'cocina') {
        throw new Error('Este modulo solo permite usuarios con rol cocina.')
      }

      const nextSession = {
        token: data.token,
        rol: data.rol,
        usuario: data.usuario,
      }

      window.localStorage.setItem('resto001:auth:cocina', JSON.stringify(nextSession))
      setSession(nextSession)
      setContrasena('')
    } catch (loginError) {
      setError(loginError.message || 'Credenciales invalidas.')
    } finally {
      setLoading(false)
    }
  }

  function handleLogout() {
    window.localStorage.removeItem('resto001:auth:cocina')
    setSession(null)
    setContrasena('')
  }

  if (!canRenderApp) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-6">
        <section className="w-full max-w-md rounded-3xl border border-cyan-500/30 bg-slate-900/90 p-6 shadow-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.32em] text-cyan-300/80">Resto 001</p>
          <h1 className="mt-2 text-3xl font-bold text-white">Login cocina</h1>
          <p className="mt-2 text-sm text-slate-300">Inicia sesion para ver la cola de cocina.</p>

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
              className="w-full rounded-xl bg-cyan-500 px-4 py-2 font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
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
    <Cocina
      authToken={session.token}
      session={session}
      onLogout={handleLogout}
    />
  )
}