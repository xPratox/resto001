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
  const [authChecking, setAuthChecking] = useState(() => Boolean(session?.token))
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
  }, [apiRequestPrefix, session?.token])

  const canRenderApp = useMemo(
    () => !authChecking && Boolean(session?.token && session?.rol === 'cocina'),
    [authChecking, session?.rol, session?.token],
  )

  useEffect(() => {
    if (!session?.token) {
      setAuthChecking(false)
      return
    }

    let ignore = false
    setAuthChecking(true)

    fetch(`${API_BASE_URL}/api/kitchen/history`, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${session.token}`,
      },
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(response.status === 401 || response.status === 403 ? 'SESSION_INVALID' : 'SESSION_CHECK_FAILED')
        }

        return response.json().catch(() => ({}))
      })
      .then(() => {
        if (ignore) {
          return
        }

        setAuthChecking(false)
      })
      .catch((sessionError) => {
        if (ignore) {
          return
        }

        window.localStorage.removeItem('resto001:auth:cocina')
        setSession(null)
        setError(sessionError.message === 'SESSION_INVALID' ? 'Inicia sesion nuevamente para acceder al modulo de cocina.' : '')
        setAuthChecking(false)
      })

    return () => {
      ignore = true
    }
  }, [session?.token])

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

  if (authChecking) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-6">
        <section className="luxury-glass luxury-hover-lift w-full max-w-md rounded-3xl p-6 text-center shadow-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.32em] text-resto-accent/80">Resto 001</p>
          <h1 className="mt-2 text-3xl font-bold text-white">Validando cocina</h1>
          <p className="mt-2 text-sm text-slate-300">Comprobando la sesion activa antes de abrir el historial.</p>
        </section>
      </main>
    )
  }

  if (!canRenderApp) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-6">
        <section className="luxury-glass luxury-hover-lift w-full max-w-md rounded-3xl p-6 shadow-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.32em] text-resto-accent/80">Resto 001</p>
          <h1 className="mt-2 text-3xl font-bold text-white">Login cocina</h1>
          <p className="mt-2 text-sm text-slate-300">Inicia sesion para ver el historial de comandas de cocina.</p>

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
              className="luxury-primary w-full rounded-xl px-4 py-2 font-semibold disabled:cursor-not-allowed disabled:opacity-60"
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