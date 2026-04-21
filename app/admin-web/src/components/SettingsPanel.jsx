function formatRateTimestamp(value) {
  if (!value) {
    return 'Sin registro'
  }

  return new Intl.DateTimeFormat('es-VE', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function formatRateValue(value) {
  const numericValue = Number(value)
  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue.toFixed(2) : '--'
}

function SettingsPanel({ values, resolvedRates, latestRateUpdate, rateHistory, onChange, onSubmit, saving, className = '' }) {
  return (
    <section className={`relative overflow-hidden rounded-[24px] sm:rounded-[30px] border border-white/10 bg-slate-900/60 p-4 sm:p-5 backdrop-blur-md ${className}`}>
      <div className="absolute inset-0 rounded-[30px] bg-gradient-to-br from-cyan-400/8 via-transparent to-cyan-100/5" />
      <div className="relative flex h-full flex-col gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.28em] text-cyan-200">Tasas</p>
          <h2 className="mt-2 text-lg sm:text-xl font-semibold text-white">Exchange cockpit</h2>
          <p className="mt-1 text-sm md:text-base text-slate-400">Control exclusivo de administrador con bloqueo de una sola actualizacion diaria.</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <article className="rounded-[24px] border border-white/10 bg-slate-950/50 p-4">
            <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">BCV efectivo</p>
            <strong className="mt-2 block text-xl sm:text-2xl font-semibold text-white">{resolvedRates?.bcv?.rate || '--'}</strong>
            <span className="mt-1 block text-xs text-cyan-200/80">{resolvedRates?.bcv?.source || 'sin fuente'}</span>
          </article>
          <article className="rounded-[24px] border border-cyan-300/20 bg-cyan-400/10 p-4">
            <p className="text-[11px] uppercase tracking-[0.22em] text-cyan-200/80">COP efectivo</p>
            <strong className="mt-2 block text-xl sm:text-2xl font-semibold text-cyan-50">{resolvedRates?.cop?.rate || '--'}</strong>
            <span className="mt-1 block text-xs text-cyan-100/80">{resolvedRates?.cop?.source || 'sin fuente'}</span>
          </article>
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <article className="rounded-[24px] border border-white/10 bg-slate-950/50 p-4">
            <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Ultima actualizacion</p>
            <strong className="mt-2 block text-lg font-semibold text-white">
              {latestRateUpdate?.updatedBy ? `Por ${latestRateUpdate.updatedBy}` : 'Sin registro'}
            </strong>
            <span className="mt-2 block text-sm text-slate-300">{formatRateTimestamp(latestRateUpdate?.updatedAt)}</span>
            <p className="mt-3 text-xs uppercase tracking-[0.22em] text-slate-500">Dia operativo</p>
            <p className="mt-1 text-sm text-cyan-100">{latestRateUpdate?.dayKey || 'Pendiente'}</p>
          </article>

          <article className="rounded-[24px] border border-cyan-300/20 bg-cyan-400/10 p-4">
            <p className="text-[11px] uppercase tracking-[0.22em] text-cyan-200/80">Historial reciente</p>
            <div className="mt-3 space-y-3">
              {(rateHistory || []).slice(0, 4).map((entry) => (
                <div key={`${entry.dayKey}-${entry.updatedAt}`} className="rounded-2xl border border-white/10 bg-slate-950/40 px-3 py-3">
                  <div className="flex items-center justify-between gap-3 text-xs uppercase tracking-[0.18em] text-slate-400">
                    <span>{entry.dayKey}</span>
                    <span>{entry.updatedBy || 'admin'}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-4 text-sm text-white">
                    <span>BCV {formatRateValue(entry.bcv)}</span>
                    <span>COP {formatRateValue(entry.cop)}</span>
                  </div>
                  <p className="mt-2 text-xs text-slate-400">{formatRateTimestamp(entry.updatedAt)}</p>
                </div>
              ))}

              {!rateHistory?.length ? <p className="text-sm text-slate-300">Todavia no hay actualizaciones registradas.</p> : null}
            </div>
          </article>
        </div>

        <form className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]" onSubmit={onSubmit}>
          <label className="space-y-2">
            <span className="text-xs uppercase tracking-[0.22em] text-slate-400">BCV manual</span>
            <input
              name="bcv"
              type="number"
              min="0"
              step="0.01"
              value={values.bcv}
              onChange={onChange}
              className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm md:text-base text-white outline-none transition focus:border-cyan-300/40"
            />
          </label>

          <label className="space-y-2">
            <span className="text-xs uppercase tracking-[0.22em] text-slate-400">COP manual</span>
            <input
              name="cop"
              type="number"
              min="0"
              step="0.01"
              value={values.cop}
              onChange={onChange}
              className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm md:text-base text-white outline-none transition focus:border-cyan-300/40"
            />
          </label>

          <button
            type="submit"
            disabled={saving}
            className="mt-auto min-h-11 rounded-2xl border border-cyan-300/20 bg-cyan-400/10 px-4 py-3 text-sm md:text-base font-semibold text-cyan-100 transition hover:border-cyan-300/40 hover:bg-cyan-400/15 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? 'Actualizando...' : 'Guardar'}
          </button>
        </form>

        <p className="text-xs text-slate-500">Solo se permite una actualizacion de tasas por dia calendario. Si no cargas una nueva, se mantiene la ultima configuracion valida.</p>
      </div>
    </section>
  )
}

export default SettingsPanel