import { useEffect, useMemo, useState } from 'react'
import { BarChart3, LogOut, Menu, Settings, ShieldCheck, Sparkles, UtensilsCrossed, Users, X } from 'lucide-react'

import MenuManager from './MenuManager'
import ReportsPanel from './ReportsPanel'
import SettingsPanel from './SettingsPanel'
import Sparkline from './Sparkline'
import UserManager from './UserManager'
import ThemeToggle from './ThemeToggle'

function formatCurrency(value) {
  return new Intl.NumberFormat('es-VE', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(Number(value || 0))
}

function buildStatCards(report) {
  const kpis = report?.kpis || {}
  const transactions = report?.transactions || []
  const hourlySales = report?.hourlySales || []

  const orderCountByHour = Object.values(
    transactions.reduce((accumulator, transaction) => {
      const paidAt = transaction?.hora_pago ? new Date(transaction.hora_pago) : null

      if (!paidAt || Number.isNaN(paidAt.getTime())) {
        return accumulator
      }

      const hour = `${String(paidAt.getHours()).padStart(2, '0')}:00`

      if (!accumulator[hour]) {
        accumulator[hour] = { hour, value: 0 }
      }

      accumulator[hour].value += 1
      return accumulator
    }, {}),
  ).map((entry) => entry.value)

  const avgTicketTrend = hourlySales.map((slot) => {
    const revenue = Number(slot?.total || 0)
    const transactionsInHour = transactions.filter((transaction) => {
      const paidAt = transaction?.hora_pago ? new Date(transaction.hora_pago) : null
      return paidAt && `${String(paidAt.getHours()).padStart(2, '0')}:00` === slot.hour
    }).length

    return transactionsInHour ? revenue / transactionsInHour : 0
  })

  const tableTrend = Object.values(
    transactions.reduce((accumulator, transaction) => {
      const paidAt = transaction?.hora_pago ? new Date(transaction.hora_pago) : null

      if (!paidAt || Number.isNaN(paidAt.getTime())) {
        return accumulator
      }

      const hour = `${String(paidAt.getHours()).padStart(2, '0')}:00`

      if (!accumulator[hour]) {
        accumulator[hour] = new Set()
      }

      accumulator[hour].add(String(transaction.table || ''))
      return accumulator
    }, {}),
  ).map((entry) => entry.size)

  return [
    {
      label: 'Ventas',
      value: formatCurrency(kpis.totalRevenue || 0),
      trend: hourlySales.map((slot) => Number(slot?.total || 0)),
      accent: 'from-[#BF953F]/80 via-[#FCF6BA]/55 to-transparent',
    },
    {
      label: 'Ordenes',
      value: String(kpis.totalOrders || 0),
      trend: orderCountByHour,
      accent: 'from-[#C0C0C0]/70 via-[#F5F5F5]/35 to-transparent',
    },
    {
      label: 'Ticket Promedio',
      value: formatCurrency(kpis.averageTicket || 0),
      trend: avgTicketTrend,
      accent: 'from-[#D4AF37]/70 via-[#C0C0C0]/30 to-transparent',
    },
    {
      label: 'Mesas Atendidas',
      value: String(kpis.cleanedTablesCount || 0),
      trend: tableTrend,
      accent: 'from-[#C0C0C0]/75 via-[#FCF6BA]/26 to-transparent',
    },
  ]
}

function SidebarItem({ icon: Icon, label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`admin-sidebar-item admin-hover-lift flex min-h-11 w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm md:text-base font-medium transition ${
        active
          ? 'admin-sidebar-item--active border border-cyan-300/30 bg-cyan-400/10 text-cyan-50'
          : 'border border-transparent text-slate-300 hover:border-white/10 hover:bg-white/5 hover:text-white'
      }`}
    >
      <Icon className="admin-sidebar-item__icon h-4 w-4" />
      {label}
    </button>
  )
}

function AdminDashboard(props) {
  const {
    session,
    onLogout,
    theme,
    onToggleTheme,
    banner,
    menuItems,
    menuForm,
    onMenuChange,
    onMenuSubmit,
    onMenuEdit,
    onMenuDelete,
    onOpenMenuModal,
    onCloseMenuModal,
    isMenuModalOpen,
    menuSaving,
    users,
    userForm,
    onUserChange,
    onUserSubmit,
    onOpenUserDrawer,
    onCloseUserDrawer,
    isUserDrawerOpen,
    userSaving,
    settingsForm,
    resolvedRates,
    latestRateUpdate,
    rateHistory,
    onSettingsChange,
    onSettingsSubmit,
    settingsSaving,
    report,
    reportRange,
    onReportRangeChange,
  } = props
  const [activeSection, setActiveSection] = useState('dashboard')
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false)

  const statCards = useMemo(() => buildStatCards(report), [report])
  const mobilePriorityCards = useMemo(
    () => [
      statCards.find((card) => card.label === 'Ventas'),
      {
        label: 'Tasas',
        value: `BCV ${resolvedRates?.bcv?.rate || '--'} / COP ${resolvedRates?.cop?.rate || '--'}`,
        trend: [Number(resolvedRates?.bcv?.rate || 0), Number(resolvedRates?.cop?.rate || 0)],
        accent: 'from-cyan-300/70 via-emerald-300/35 to-transparent',
        helper: latestRateUpdate?.dayKey ? `Actualizada ${latestRateUpdate.dayKey}` : 'Sin actualizacion diaria',
      },
      ...statCards.filter((card) => card.label !== 'Ventas'),
    ].filter(Boolean),
    [latestRateUpdate?.dayKey, resolvedRates?.bcv?.rate, resolvedRates?.cop?.rate, statCards],
  )
  const navigationItems = [
    { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
    { id: 'menu', label: 'Menu / Platos', icon: UtensilsCrossed },
    { id: 'users', label: 'Usuarios / Personal', icon: Users },
    { id: 'settings', label: 'Ajustes Globales', icon: Settings },
  ]

  const sectionTitle =
    navigationItems.find((item) => item.id === activeSection)?.label || 'Dashboard'

  useEffect(() => {
    if (!isMobileSidebarOpen) {
      return undefined
    }

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setIsMobileSidebarOpen(false)
      }
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [isMobileSidebarOpen])

  const handleSectionChange = (sectionId) => {
    setActiveSection(sectionId)
    setIsMobileSidebarOpen(false)
  }

  const sidebarContent = (
    <>
      <div className="admin-luxury-panel admin-sidebar-glass admin-hover-lift rounded-[28px] border border-white/10 bg-white/5 p-5">
        <div className="admin-eyebrow inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-[11px] uppercase tracking-[0.28em] text-cyan-200">
          <Sparkles className="h-3.5 w-3.5" />
          Resto 001
        </div>
        <h1 className="admin-tech-title admin-serif-heading mt-4 text-xl sm:text-2xl font-bold tracking-[0.08em] text-white">Admin Web</h1>
        <p className="mt-2 text-sm md:text-base leading-6 text-slate-400">Centro operativo con navegacion lateral y modulos dedicados.</p>
      </div>

      <nav className="mt-6 flex flex-1 flex-col gap-2">
        {navigationItems.map((item) => (
          <SidebarItem
            key={item.id}
            icon={item.icon}
            label={item.label}
            active={activeSection === item.id}
            onClick={() => handleSectionChange(item.id)}
          />
        ))}
      </nav>

      <div className="admin-luxury-panel admin-sidebar-glass admin-hover-lift rounded-[28px] border border-white/10 bg-white/5 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-400/10 text-cyan-200">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Sesion</p>
            <p className="text-sm md:text-base font-semibold text-white">{session?.nombre || session?.usuario}</p>
            <p className="text-xs text-cyan-200/90">{session?.rol}</p>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <ThemeToggle theme={theme} onToggle={onToggleTheme} compact />
          <button
            type="button"
            onClick={onLogout}
            className="admin-secondary-button inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm md:text-base font-medium text-slate-200 transition hover:border-cyan-300/40 hover:bg-cyan-400/10 hover:text-white"
          >
            <LogOut className="h-4 w-4" />
            Cerrar sesion
          </button>
        </div>
      </div>
    </>
  )

  return (
    <main className="admin-shell min-h-screen bg-slate-950 text-slate-50">
      <div className="admin-shell-gradient relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.18),_transparent_22%),radial-gradient(circle_at_85%_10%,_rgba(103,232,249,0.14),_transparent_18%),linear-gradient(145deg,_#020617_0%,_#0f172a_42%,_#020617_100%)]">
        <div className="admin-shell-grid pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.05)_1px,transparent_1px)] bg-[size:72px_72px] opacity-25" />

        {isMobileSidebarOpen ? (
          <div className="fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-sm lg:hidden" onClick={() => setIsMobileSidebarOpen(false)} aria-hidden="true" />
        ) : null}

        <div className="relative flex min-h-screen">
          <aside className="admin-sidebar-shell hidden w-64 min-h-screen shrink-0 border-r border-white/10 bg-slate-950/75 p-5 backdrop-blur-md lg:flex lg:flex-col">
            {sidebarContent}
          </aside>

          <aside className={`admin-sidebar-shell fixed inset-y-0 left-0 z-50 flex w-[88vw] max-w-sm flex-col border-r border-white/10 bg-slate-950/95 p-5 backdrop-blur-md transition-transform duration-300 lg:hidden ${
            isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}>
            <div className="mb-4 flex items-center justify-between">
              <p className="admin-eyebrow text-xs uppercase tracking-[0.28em] text-cyan-200">Navegacion</p>
              <button
                type="button"
                onClick={() => setIsMobileSidebarOpen(false)}
                className="admin-secondary-button inline-flex min-h-11 min-w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-200 transition hover:border-cyan-300/40 hover:bg-cyan-400/10 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {sidebarContent}
          </aside>

          <section className="flex-1 p-3 sm:p-4 lg:p-8">
            <header className="admin-luxury-panel admin-header-shell mb-4 sm:mb-6 flex flex-wrap items-start justify-between gap-4 rounded-[24px] sm:rounded-[30px] border border-white/10 bg-slate-900/60 p-4 sm:p-6 backdrop-blur-md">
              <div>
                <p className="admin-eyebrow text-[11px] uppercase tracking-[0.28em] text-cyan-200">Modulo activo</p>
                <h2 className="admin-tech-title admin-serif-heading mt-2 text-2xl sm:text-3xl font-bold tracking-[0.08em] text-white">{sectionTitle}</h2>
                <p className="mt-2 max-w-2xl text-sm md:text-base leading-6 text-slate-300">
                  {activeSection === 'dashboard' && 'Ventas, transacciones y cortes del dia en un espacio exclusivo para metricas.'}
                  {activeSection === 'menu' && 'Gestion completa del menu con tabla, modal de alta/edicion y acciones directas por fila.'}
                  {activeSection === 'users' && 'Monitoreo compacto del personal con estado en linea y metricas individuales.'}
                  {activeSection === 'settings' && 'Ajustes globales y tasas efectivas disponibles para toda la operacion.'}
                </p>
              </div>

              <div className="flex w-full items-center justify-between gap-3 sm:w-auto lg:hidden">
                <button
                  type="button"
                  onClick={() => setIsMobileSidebarOpen(true)}
                  className="admin-secondary-button inline-flex min-h-11 min-w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-200 transition hover:border-cyan-300/40 hover:bg-cyan-400/10 hover:text-white"
                  aria-label="Abrir menu de navegacion"
                >
                  <Menu className="h-5 w-5" />
                </button>
                <div className="admin-luxury-panel rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-right">
                  <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Sesion</p>
                  <p className="text-sm md:text-base font-semibold text-white">{session?.usuario}</p>
                </div>
                <div className="flex items-center gap-2">
                  <ThemeToggle theme={theme} onToggle={onToggleTheme} compact />
                  <button
                    type="button"
                    onClick={onLogout}
                    className="admin-secondary-button inline-flex min-h-11 items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm md:text-base font-medium text-slate-200 transition hover:border-cyan-300/40 hover:bg-cyan-400/10 hover:text-white"
                  >
                    <LogOut className="h-4 w-4" />
                    Salir
                  </button>
                </div>
              </div>
            </header>

            {banner ? (
              <div
                className={`mb-6 rounded-2xl border px-4 py-3 text-sm backdrop-blur-md ${
                  banner.type === 'error'
                    ? 'border-rose-400/20 bg-rose-400/10 text-rose-100'
                    : 'border-emerald-400/20 bg-emerald-400/10 text-emerald-100'
                }`}
              >
                {banner.message}
              </div>
            ) : null}

            {activeSection === 'dashboard' ? (
              <div className="space-y-6">
                <section className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {mobilePriorityCards.map((card) => (
                    <article
                      key={card.label}
                      className={`admin-kpi-card admin-luxury-card admin-hover-lift group relative overflow-hidden rounded-[24px] sm:rounded-[26px] border border-white/10 bg-slate-900/60 p-4 backdrop-blur-md transition duration-300 hover:border-cyan-300/30 hover:bg-slate-900/75 ${
                        card.label === 'Ventas' ? 'order-1' : card.label === 'Tasas' ? 'order-2' : 'order-3'
                      }`}
                    >
                      <div className={`admin-kpi-card__accent absolute inset-0 bg-gradient-to-br ${card.accent} opacity-40 transition duration-300 group-hover:opacity-70`} />
                      <div className="relative flex h-full items-start justify-between gap-3">
                        <div>
                          <p className="admin-eyebrow text-[11px] uppercase tracking-[0.24em] text-slate-400">{card.label}</p>
                          <strong className="mt-2 block text-lg sm:text-xl font-semibold text-white">{card.value}</strong>
                          {card.helper ? <p className="mt-2 text-sm text-cyan-100/85">{card.helper}</p> : null}
                        </div>
                        <div className="admin-kpi-spark rounded-2xl border border-cyan-300/15 bg-slate-950/50 p-2 text-cyan-200 group-hover:shadow-[0_0_24px_rgba(34,211,238,0.18)]">
                          <Sparkline data={card.trend} className="h-8 w-20" />
                        </div>
                      </div>
                    </article>
                  ))}
                </section>

                <ReportsPanel reportRange={reportRange} onRangeChange={onReportRangeChange} report={report} />
              </div>
            ) : null}

            {activeSection === 'menu' ? (
              <MenuManager
                menuItems={menuItems}
                form={menuForm}
                onChange={onMenuChange}
                onSubmit={onMenuSubmit}
                onEdit={onMenuEdit}
                onDelete={onMenuDelete}
                onOpenModal={onOpenMenuModal}
                onCloseModal={onCloseMenuModal}
                isModalOpen={isMenuModalOpen}
                saving={menuSaving}
              />
            ) : null}

            {activeSection === 'users' ? (
              <UserManager
                users={users}
                form={userForm}
                onChange={onUserChange}
                onSubmit={onUserSubmit}
                onOpenDrawer={onOpenUserDrawer}
                onCloseDrawer={onCloseUserDrawer}
                isDrawerOpen={isUserDrawerOpen}
                saving={userSaving}
                report={report}
                reportRange={reportRange}
              />
            ) : null}

            {activeSection === 'settings' ? (
              <SettingsPanel
                values={settingsForm}
                resolvedRates={resolvedRates}
                latestRateUpdate={latestRateUpdate}
                rateHistory={rateHistory}
                onChange={onSettingsChange}
                onSubmit={onSettingsSubmit}
                saving={settingsSaving}
              />
            ) : null}
          </section>
        </div>
      </div>
    </main>
  )
}

export default AdminDashboard