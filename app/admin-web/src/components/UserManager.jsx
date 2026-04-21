import { useEffect, useMemo, useState } from 'react'
import { ChevronRight, UserPlus, Users } from 'lucide-react'

import ModalShell from './ModalShell'
import StatusIndicator from './StatusIndicator'

function formatCurrency(value) {
  return new Intl.NumberFormat('es-VE', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(Number(value || 0))
}

function getInitials(name) {
  return String(name || '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('')
}

function UserManager({
  users,
  form,
  onChange,
  onSubmit,
  onOpenDrawer,
  onCloseDrawer,
  isDrawerOpen,
  saving,
  report,
  reportRange,
  className = '',
}) {
  const [selectedUserId, setSelectedUserId] = useState('')

  useEffect(() => {
    if (!users.length) {
      setSelectedUserId('')
      return
    }

    if (!users.some((user) => user._id === selectedUserId)) {
      setSelectedUserId(users[0]._id)
    }
  }, [selectedUserId, users])

  const metricsByUser = useMemo(() => {
    const transactions = report?.transactions || []

    return users.reduce((accumulator, user) => {
      const ownedTransactions = transactions.filter(
        (transaction) => String(transaction.mesonero_usuario || '').toLowerCase() === String(user.usuario || '').toLowerCase(),
      )

      accumulator[user._id] = {
        ordersHandled: ownedTransactions.length,
        tablesServed: new Set(ownedTransactions.map((transaction) => String(transaction.table || '')).filter(Boolean)).size,
        revenue: ownedTransactions.reduce((sum, transaction) => sum + Number(transaction.paymentAmount || 0), 0),
      }

      return accumulator
    }, {})
  }, [report, users])

  const selectedUser = users.find((user) => user._id === selectedUserId) || null
  const selectedMetrics = selectedUser ? metricsByUser[selectedUser._id] || { ordersHandled: 0, tablesServed: 0, revenue: 0 } : null
  const metricLabel = reportRange === 'today' ? 'hoy' : 'en este rango'

  return (
    <section className={`relative flex min-h-0 flex-col overflow-hidden rounded-[24px] sm:rounded-[30px] border border-white/10 bg-slate-900/60 backdrop-blur-md ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 px-4 sm:px-5 py-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.28em] text-cyan-200">Personal</p>
          <h2 className="mt-2 text-lg sm:text-xl font-semibold text-white">Equipo en cabina</h2>
          <p className="mt-1 text-sm md:text-base text-slate-400">Lista densa con foco en estado y productividad individual.</p>
        </div>

        <button
          type="button"
          onClick={onOpenDrawer}
          className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-cyan-300/20 bg-cyan-400/10 px-4 py-3 text-sm md:text-base font-medium text-cyan-100 transition hover:border-cyan-300/40 hover:bg-cyan-400/15 hover:shadow-[0_0_28px_rgba(34,211,238,0.18)]"
        >
          <UserPlus className="h-4 w-4" />
          Nuevo +
        </button>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 px-4 sm:px-5 py-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
            <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Activos</p>
            <p className="mt-2 text-lg font-semibold text-white">{users.filter((user) => user.is_online).length}</p>
          </div>
          <div className="rounded-2xl border border-cyan-300/20 bg-cyan-400/10 p-3">
            <p className="text-[11px] uppercase tracking-[0.22em] text-cyan-200/80">Staff</p>
            <p className="mt-2 text-lg font-semibold text-cyan-50">{users.length}</p>
          </div>
        </div>

        <div className="glass-scrollbar min-h-0 flex-1 space-y-2 overflow-auto pr-1">
          {users.map((user) => {
            const isActive = user._id === selectedUserId

            return (
              <button
                key={user._id}
                type="button"
                onClick={() => setSelectedUserId(user._id)}
                className={`group flex min-h-11 w-full items-center justify-between rounded-2xl border px-3 py-3 text-left transition ${
                  isActive
                    ? 'border-cyan-300/40 bg-cyan-400/10 shadow-[0_0_28px_rgba(34,211,238,0.18)]'
                    : 'border-white/10 bg-white/5 hover:border-cyan-300/20 hover:bg-cyan-400/6'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-2xl text-xs font-semibold ${isActive ? 'bg-cyan-400/15 text-cyan-100' : 'bg-slate-950/70 text-slate-200'}`}>
                    {getInitials(user.nombre || user.usuario)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-white">{user.nombre}</p>
                      <StatusIndicator online={user.is_online} small />
                    </div>
                    <p className="text-xs text-slate-400">@{user.usuario} · {user.rol}</p>
                  </div>
                </div>
                <ChevronRight className={`h-4 w-4 transition ${isActive ? 'text-cyan-100' : 'text-slate-500 group-hover:text-cyan-200'}`} />
              </button>
            )
          })}

          {!users.length ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-white/3 p-6 text-center text-sm text-slate-400">
              No hay trabajadores cargados.
            </div>
          ) : null}
        </div>

        <div className="rounded-[26px] border border-white/10 bg-slate-950/50 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-400/10 text-cyan-200">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Metrica Individual</p>
              <h3 className="text-base font-semibold text-white">{selectedUser?.nombre || 'Selecciona un trabajador'}</h3>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
              <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Mesas {metricLabel}</p>
              <p className="mt-2 text-lg font-semibold text-white">{selectedMetrics?.tablesServed || 0}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
              <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Ordenes</p>
              <p className="mt-2 text-lg font-semibold text-white">{selectedMetrics?.ordersHandled || 0}</p>
            </div>
            <div className="rounded-2xl border border-cyan-300/20 bg-cyan-400/10 p-3">
              <p className="text-[11px] uppercase tracking-[0.22em] text-cyan-200/80">Ventas</p>
              <p className="mt-2 text-lg font-semibold text-cyan-50">{formatCurrency(selectedMetrics?.revenue || 0)}</p>
            </div>
          </div>
        </div>
      </div>

      <ModalShell
        open={isDrawerOpen}
        onClose={onCloseDrawer}
        eyebrow="Nuevo Trabajador"
        title="Crear perfil operativo"
        description="El alta de personal vive en un side drawer para mantener la pantalla principal enfocada en operación y monitoreo."
        position="right"
      >
        <form className="space-y-4" onSubmit={onSubmit}>
          <label className="block space-y-2">
            <span className="text-xs uppercase tracking-[0.22em] text-slate-400">Nombre</span>
            <input
              name="nombre"
              value={form.nombre}
              onChange={onChange}
              required
              className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm md:text-base text-white outline-none transition focus:border-cyan-300/40"
            />
          </label>

          <label className="block space-y-2">
            <span className="text-xs uppercase tracking-[0.22em] text-slate-400">Usuario</span>
            <input
              name="usuario"
              value={form.usuario}
              onChange={onChange}
              required
              className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm md:text-base text-white outline-none transition focus:border-cyan-300/40"
            />
          </label>

          <label className="block space-y-2">
            <span className="text-xs uppercase tracking-[0.22em] text-slate-400">Password</span>
            <input
              name="contrasena"
              type="password"
              value={form.contrasena}
              onChange={onChange}
              required
              className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm md:text-base text-white outline-none transition focus:border-cyan-300/40"
            />
          </label>

          <label className="block space-y-2">
            <span className="text-xs uppercase tracking-[0.22em] text-slate-400">Rol</span>
            <select
              name="rol"
              value={form.rol}
              onChange={onChange}
              className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm md:text-base text-white outline-none transition focus:border-cyan-300/40"
            >
              <option value="admin">admin</option>
              <option value="caja">caja</option>
              <option value="mesonero">mesonero</option>
              <option value="cocina">cocina</option>
            </select>
          </label>

          <div className="rounded-2xl border border-cyan-300/15 bg-cyan-400/8 p-4 text-sm text-slate-300">
            Usa roles cortos y usuarios consistentes para que las metricas por trabajador puedan agregarse correctamente en el dashboard.
          </div>

          <div className="flex flex-wrap justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onCloseDrawer}
              className="min-h-11 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm md:text-base font-medium text-slate-200 transition hover:border-cyan-300/40 hover:bg-cyan-400/10"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="min-h-11 rounded-2xl border border-cyan-300/20 bg-cyan-400/10 px-4 py-3 text-sm md:text-base font-semibold text-cyan-100 transition hover:border-cyan-300/40 hover:bg-cyan-400/15 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? 'Creando...' : 'Crear trabajador'}
            </button>
          </div>
        </form>
      </ModalShell>
    </section>
  )
}

export default UserManager