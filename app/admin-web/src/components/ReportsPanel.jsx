import Sparkline from './Sparkline'

function formatCurrency(value) {
  return new Intl.NumberFormat('es-VE', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(Number(value || 0))
}

function formatDateTime(value) {
  if (!value) {
    return '--'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return '--'
  }

  return new Intl.DateTimeFormat('es-VE', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date)
}

function ReportsPanel({ reportRange, onRangeChange, report, className = '' }) {
  const transactions = report?.transactions || []
  const paymentMethodBreakdown = report?.paymentMethodBreakdown || []
  const hourlySales = report?.hourlySales || []
  const summaryByDay = report?.summaryByDay || []
  const dailyTrend = summaryByDay.map((entry) => Number(entry?.totalRevenue || 0))

  return (
    <section className={`admin-report-shell admin-luxury-panel relative flex min-h-0 flex-col overflow-hidden rounded-[24px] sm:rounded-[30px] border border-white/10 bg-slate-900/60 backdrop-blur-md ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 px-4 sm:px-5 py-4">
        <div>
          <p className="admin-eyebrow text-[11px] uppercase tracking-[0.28em] text-cyan-200">Reportes</p>
          <h2 className="admin-tech-title admin-serif-heading mt-2 text-lg sm:text-xl font-semibold text-white">Ritmo del servicio</h2>
          <p className="mt-1 text-sm md:text-base text-slate-400">Tendencia del rango, desglose de pagos y flujo de transacciones.</p>
        </div>

        <select
          className="admin-secondary-button min-h-11 rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm md:text-base text-white outline-none transition focus:border-cyan-300/40"
          value={reportRange}
          onChange={onRangeChange}
        >
          <option value="today">Hoy</option>
          <option value="yesterday">Ayer</option>
          <option value="week">Semana</option>
          <option value="month">Mes</option>
        </select>
      </div>

      <div className="grid gap-4 border-b border-white/10 px-4 sm:px-5 py-4 lg:grid-cols-[1.2fr_0.8fr]">
        <article className="admin-report-card admin-luxury-card admin-hover-lift rounded-[26px] border border-white/10 bg-slate-950/45 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="admin-eyebrow text-[11px] uppercase tracking-[0.24em] text-slate-500">Resumen del rango</p>
              <p className="admin-serif-heading mt-2 text-lg font-semibold text-white">{report?.range?.label || 'Hoy'}</p>
            </div>
            <div className="admin-spark-shell rounded-2xl border border-cyan-300/15 bg-cyan-400/8 p-2 text-cyan-200">
              <Sparkline data={dailyTrend.length ? dailyTrend : hourlySales.map((slot) => Number(slot?.total || 0))} className="h-10 w-28" />
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="admin-report-metric rounded-2xl border border-white/10 bg-white/5 p-3">
              <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Transacciones</p>
              <p className="mt-2 text-lg font-semibold text-white">{report?.totalTransactions || 0}</p>
            </div>
            <div className="admin-report-metric rounded-2xl border border-white/10 bg-white/5 p-3">
              <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Mesas Totales</p>
              <p className="mt-2 text-lg font-semibold text-white">{report?.totalTables || 0}</p>
            </div>
            <div className="admin-report-metric admin-report-metric--accent rounded-2xl border border-cyan-300/20 bg-cyan-400/10 p-3">
              <p className="text-[11px] uppercase tracking-[0.22em] text-cyan-200/80">Ultimo corte</p>
              <p className="mt-2 text-sm font-semibold text-cyan-50">{report?.daySummary?.reportDate || '--'}</p>
            </div>
          </div>
        </article>

        <article className="admin-report-card admin-luxury-card admin-hover-lift rounded-[26px] border border-white/10 bg-slate-950/45 p-4">
          <p className="admin-eyebrow text-[11px] uppercase tracking-[0.24em] text-slate-500">Metodos de pago</p>
          <div className="mt-4 space-y-3">
            {paymentMethodBreakdown.length ? (
              paymentMethodBreakdown.map((entry) => {
                const peak = Math.max(...paymentMethodBreakdown.map((item) => Number(item.total || 0)), 1)
                const width = `${Math.max((Number(entry.total || 0) / peak) * 100, 14)}%`

                return (
                  <div key={entry.method} className="space-y-2">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="capitalize text-slate-200">{entry.method}</span>
                      <span className="font-medium text-cyan-100">{formatCurrency(entry.total)}</span>
                    </div>
                    <div className="admin-progress-track h-2 rounded-full bg-white/6">
                      <div className="admin-progress-fill h-2 rounded-full bg-gradient-to-r from-cyan-400/80 via-sky-300/70 to-cyan-200/70" style={{ width }} />
                    </div>
                  </div>
                )
              })
            ) : (
              <div className="admin-empty-state rounded-2xl border border-dashed border-white/10 bg-white/3 p-4 text-sm text-slate-400">
                Sin pagos registrados en este rango.
              </div>
            )}
          </div>
        </article>
      </div>

      <div className="min-h-0 flex-1 px-4 sm:px-5 pb-5 pt-4">
        <div className="admin-table-shell admin-luxury-card glass-scrollbar h-full overflow-auto rounded-3xl border border-white/10 bg-slate-950/45">
          <table className="admin-report-table min-w-full text-left text-sm text-slate-200">
            <thead className="admin-report-thead sticky top-0 z-10 bg-slate-950/90 text-[11px] uppercase tracking-[0.24em] text-slate-400 backdrop-blur-md">
              <tr>
                <th className="px-4 py-3 font-medium">Mesa</th>
                <th className="px-4 py-3 font-medium">Mesonero</th>
                <th className="px-4 py-3 font-medium">Metodo</th>
                <th className="px-4 py-3 font-medium">Monto</th>
                <th className="px-4 py-3 font-medium">Hora</th>
              </tr>
            </thead>
            <tbody>
              {transactions.length ? (
                transactions.map((transaction) => (
                  <tr key={transaction.transactionId || transaction._id} className="admin-report-row border-t border-white/6 transition hover:bg-white/4">
                    <td className="px-4 py-3 font-medium text-white">
                      <span className="admin-table-badge inline-flex rounded-full px-3 py-1 text-xs font-semibold">
                        {transaction.table}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-300">{transaction.mesonero_usuario || 'Sin asignar'}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs capitalize text-slate-200">
                        {transaction.paymentMethod}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-cyan-100">{formatCurrency(transaction.paymentAmount)}</td>
                    <td className="px-4 py-3 text-slate-400">{formatDateTime(transaction.hora_pago)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5" className="px-4 py-10 text-center text-sm text-slate-400">
                    No hay transacciones para este rango.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

export default ReportsPanel