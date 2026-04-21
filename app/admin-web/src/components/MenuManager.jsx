import { Pencil, Plus, Trash2, X } from 'lucide-react'

function formatCurrency(value) {
  return new Intl.NumberFormat('es-VE', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(Number(value || 0))
}

function getThumbnailLabel(name) {
  return String(name || '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('')
}

function MenuManager({
  menuItems,
  form,
  onChange,
  onSubmit,
  onEdit,
  onDelete,
  onOpenModal,
  onCloseModal,
  isModalOpen,
  saving,
  className = '',
}) {
  const isEditing = Boolean(form.id)

  return (
    <section className={`relative flex min-h-0 flex-col overflow-hidden rounded-[24px] sm:rounded-[30px] border border-white/10 bg-slate-900/60 backdrop-blur-md ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 px-4 sm:px-5 py-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.28em] text-cyan-200">Gestion de Menu</p>
          <h2 className="mt-2 text-lg sm:text-xl font-semibold text-white">Menu completo de platos</h2>
          <p className="mt-1 text-sm md:text-base text-slate-400">CRUD sincronizado con el backend sin cambiar de seccion ni recargar la pagina.</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-right">
            <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Items</p>
            <p className="text-sm font-semibold text-white">{menuItems.length}</p>
          </div>

          <button
            type="button"
            onClick={onOpenModal}
            className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-cyan-300/20 bg-cyan-400/10 px-4 py-3 text-sm md:text-base font-medium text-cyan-100 transition hover:border-cyan-300/40 hover:bg-cyan-400/15 hover:shadow-[0_0_28px_rgba(34,211,238,0.18)]"
          >
            <Plus className="h-4 w-4" />
            Nuevo Plato
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 px-4 sm:px-5 pb-5 pt-4">
        <div className="space-y-3 md:hidden">
          {menuItems.length ? (
            menuItems.map((item) => (
              <article key={item._id} className="rounded-[24px] border border-white/10 bg-slate-950/45 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-cyan-300/15 bg-gradient-to-br from-cyan-400/20 via-sky-400/10 to-transparent text-sm font-semibold text-cyan-100">
                      {getThumbnailLabel(item.nombre)}
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-white">{item.nombre}</h3>
                      <p className="mt-1 text-sm text-slate-400">{item.categoria}</p>
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-cyan-100">{formatCurrency(item.precio)}</span>
                </div>

                <p className="mt-3 text-sm text-slate-300">{item.descripcion || 'Sin descripcion'}</p>

                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={() => onEdit(item)}
                    className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-slate-200 transition hover:border-cyan-300/40 hover:bg-cyan-400/10 hover:text-cyan-100"
                  >
                    <Pencil className="h-4 w-4" />
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(item)}
                    className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-slate-200 transition hover:border-rose-300/40 hover:bg-rose-400/10 hover:text-rose-100"
                  >
                    <Trash2 className="h-4 w-4" />
                    Eliminar
                  </button>
                </div>
              </article>
            ))
          ) : (
            <div className="rounded-3xl border border-white/10 bg-slate-950/45 px-4 py-10 text-center text-sm text-slate-400">
              No hay platos cargados todavia.
            </div>
          )}
        </div>

        <div className="glass-scrollbar hidden h-full overflow-auto rounded-3xl border border-white/10 bg-slate-950/45 md:block">
          <table className="min-w-full text-left text-sm text-slate-200">
            <thead className="sticky top-0 z-10 bg-slate-950/95 text-[11px] uppercase tracking-[0.24em] text-slate-400 backdrop-blur-md">
              <tr>
                <th className="px-4 py-3 font-medium">Imagen</th>
                <th className="px-4 py-3 font-medium">Nombre</th>
                <th className="px-4 py-3 font-medium">Categoria</th>
                <th className="px-4 py-3 font-medium">Precio</th>
                <th className="hidden lg:table-cell px-4 py-3 font-medium">Descripcion</th>
                <th className="px-4 py-3 text-right font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {menuItems.length ? (
                menuItems.map((item) => (
                  <tr key={item._id} className="border-t border-white/6 transition hover:bg-white/4">
                    <td className="px-4 py-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-300/15 bg-gradient-to-br from-cyan-400/20 via-sky-400/10 to-transparent text-sm font-semibold text-cyan-100">
                        {getThumbnailLabel(item.nombre)}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-medium text-white">{item.nombre}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200">
                        {item.categoria}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-cyan-100">{formatCurrency(item.precio)}</td>
                    <td className="hidden lg:table-cell max-w-[18rem] px-4 py-3 text-slate-400">{item.descripcion || 'Sin descripcion'}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => onEdit(item)}
                          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-200 transition hover:border-cyan-300/40 hover:bg-cyan-400/10 hover:text-cyan-100"
                          aria-label={`Editar ${item.nombre}`}
                          title="Editar"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(item)}
                          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-200 transition hover:border-rose-300/40 hover:bg-rose-400/10 hover:text-rose-100"
                          aria-label={`Eliminar ${item.nombre}`}
                          title="Eliminar"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="6" className="px-4 py-10 text-center text-sm md:text-base text-slate-400">
                    No hay platos cargados todavia.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="pointer-events-none fixed inset-y-0 right-0 z-40 flex justify-end">
        <aside
          className={`pointer-events-auto flex h-full w-full max-w-none flex-col border-l border-white/10 bg-slate-900/95 shadow-[-24px_0_60px_rgba(2,6,23,0.45)] backdrop-blur-md transition-transform duration-300 ease-out sm:w-[95vw] md:w-[72vw] lg:w-[42vw] xl:w-[36vw] ${
            isModalOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
          aria-hidden={!isModalOpen}
        >
          <div className="relative border-b border-white/10 bg-slate-900/95 px-4 py-4 sm:px-5 backdrop-blur-md">
            <div className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-cyan-400/10 to-transparent" />
            <div className="relative flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.28em] text-cyan-200">
                  {isEditing ? 'Editar Plato' : 'Nuevo Plato'}
                </p>
                <h3 className="mt-2 text-xl sm:text-2xl font-semibold text-white">
                  {isEditing ? 'Actualizar item del menu' : 'Agregar item al menu'}
                </h3>
                <p className="mt-2 text-sm md:text-base leading-6 text-slate-300">
                  Completa el formulario sin perder de vista la tabla principal.
                </p>
              </div>

              <button
                type="button"
                onClick={onCloseModal}
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-200 transition hover:border-cyan-300/40 hover:bg-cyan-400/10 hover:text-cyan-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="glass-scrollbar flex-1 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
            <form id="menu-item-form" className="flex flex-col gap-4" onSubmit={onSubmit}>
              <label className="space-y-2">
                <span className="text-xs uppercase tracking-[0.22em] text-slate-400">Nombre</span>
                <input
                  name="nombre"
                  value={form.nombre}
                  onChange={onChange}
                  required
                  className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm md:text-base text-white outline-none transition focus:border-cyan-300/40"
                />
              </label>

              <label className="space-y-2">
                <span className="text-xs uppercase tracking-[0.22em] text-slate-400">Categoria</span>
                <input
                  name="categoria"
                  value={form.categoria}
                  onChange={onChange}
                  required
                  className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm md:text-base text-white outline-none transition focus:border-cyan-300/40"
                />
              </label>

              <label className="space-y-2">
                <span className="text-xs uppercase tracking-[0.22em] text-slate-400">Precio</span>
                <input
                  name="precio"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.precio}
                  onChange={onChange}
                  required
                  className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm md:text-base text-white outline-none transition focus:border-cyan-300/40"
                />
              </label>

              <label className="space-y-2">
                <span className="text-xs uppercase tracking-[0.22em] text-slate-400">Descripcion</span>
                <textarea
                  name="descripcion"
                  rows="5"
                  value={form.descripcion}
                  onChange={onChange}
                  className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm md:text-base text-white outline-none transition focus:border-cyan-300/40"
                />
              </label>

              <div className="rounded-2xl border border-cyan-300/15 bg-cyan-400/8 p-4 text-sm text-slate-300">
                Este panel lateral deja visible la tabla para revisar platos existentes mientras creas o editas uno nuevo.
              </div>
            </form>
          </div>

          <div className="sticky bottom-0 border-t border-white/10 bg-slate-900/95 px-4 py-4 sm:px-5 backdrop-blur-md">
            <div className="flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={onCloseModal}
                className="min-h-11 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm md:text-base font-medium text-slate-200 transition hover:border-cyan-300/40 hover:bg-cyan-400/10"
              >
                Cancelar
              </button>
              <button
                type="submit"
                form="menu-item-form"
                disabled={saving}
                className="min-h-11 rounded-2xl border border-cyan-300/20 bg-cyan-400/10 px-4 py-3 text-sm md:text-base font-semibold text-cyan-100 transition hover:border-cyan-300/40 hover:bg-cyan-400/15 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? 'Guardando...' : isEditing ? 'Actualizar plato' : 'Guardar plato'}
              </button>
            </div>
          </div>
        </aside>
      </div>
    </section>
  )
}

export default MenuManager