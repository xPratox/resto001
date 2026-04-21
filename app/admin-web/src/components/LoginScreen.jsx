import ThemeToggle from './ThemeToggle'

function LoginScreen({
  usuario,
  contrasena,
  error,
  loading,
  theme,
  onToggleTheme,
  onUsuarioChange,
  onContrasenaChange,
  onSubmit,
}) {
  return (
    <main className="admin-shell admin-auth-shell relative min-h-screen overflow-hidden bg-slate-950 text-slate-50">
      <div className="admin-shell-gradient absolute inset-0" />
      <div className="admin-shell-grid absolute inset-0 bg-[size:64px_64px]" />

      <section className="relative z-10 flex min-h-screen items-center justify-center p-4">
        <div className="admin-auth-card w-full max-w-md rounded-[32px] border border-white/10 bg-slate-900/60 p-7 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-md sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <p className="inline-flex rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-[11px] uppercase tracking-[0.28em] text-cyan-200">
              Resto 001 / Admin
            </p>
            <ThemeToggle theme={theme} onToggle={onToggleTheme} compact />
          </div>

          <div className="text-center">
            <p className="mt-4 inline-flex rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-[11px] uppercase tracking-[0.28em] text-cyan-200">
              Dashboard central
            </p>
            <h1 className="admin-tech-title mt-4 text-3xl font-bold tracking-[0.08em] text-white">Acceso Administrador</h1>
            <p className="mt-3 text-sm leading-6 text-slate-300">Ingresa para abrir el dashboard.</p>
          </div>

          <form className="mt-8 space-y-4" onSubmit={onSubmit}>
            <label className="block space-y-2">
              <span className="text-xs uppercase tracking-[0.22em] text-slate-400">Usuario</span>
              <input
                value={usuario}
                onChange={onUsuarioChange}
                autoComplete="username"
                required
                className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300/40 focus:bg-slate-950"
              />
            </label>

            <label className="block space-y-2">
              <span className="text-xs uppercase tracking-[0.22em] text-slate-400">Password</span>
              <input
                type="password"
                value={contrasena}
                onChange={onContrasenaChange}
                autoComplete="current-password"
                required
                className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300/40 focus:bg-slate-950"
              />
            </label>

            {error ? (
              <p className="mx-auto max-w-xs rounded-full border border-rose-400/20 bg-rose-400/10 px-4 py-2 text-center text-sm text-rose-100">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="inline-flex w-full items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-400/15 px-4 py-3 text-sm font-semibold text-cyan-100 transition hover:border-cyan-300/40 hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Validando acceso...' : 'Entrar'}
            </button>
          </form>
        </div>
      </section>
    </main>
  )
}

export default LoginScreen