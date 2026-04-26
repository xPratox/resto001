import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, Pencil, Plus, Trash2, X } from 'lucide-react'

const MENU_SECTION_ORDER = [
  'PICOTEO',
  'ENSALADAS',
  'ARROCES',
  'PASTAS',
  'HAMBURGUESAS Y SANGUCHES',
  'DE LA BARRA DE CAFE',
  'BEBIDAS',
  'COCTELES DE LA CASA',
]
const CAFE_CATEGORIES = ['CALIENTES', 'MALTEADAS Y MERENGADAS', 'FRAPPUCCINOS']

function getSectionOrderIndex(category) {
  const normalized = String(category || '').trim().toUpperCase()
  const index = MENU_SECTION_ORDER.indexOf(normalized)
  return index === -1 ? Number.MAX_SAFE_INTEGER : index
}

function mapCategoryToSection(category) {
  const normalized = String(category || '').trim().toUpperCase()
  if (CAFE_CATEGORIES.includes(normalized)) {
    return 'DE LA BARRA DE CAFE'
  }

  return normalized || 'MENU'
}

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
  const groupedMenu = useMemo(() => {
    const grouped = menuItems.reduce((accumulator, item) => {
      const sourceCategory = String(item?.categoria || 'Menu').trim().toUpperCase() || 'MENU'
      const section = mapCategoryToSection(sourceCategory)

      if (!accumulator[section]) {
        accumulator[section] = []
      }

      accumulator[section].push({
        ...item,
        _sourceCategory: sourceCategory,
      })
      return accumulator
    }, {})

    return Object.entries(grouped).sort((left, right) => {
      const byOrder = getSectionOrderIndex(left[0]) - getSectionOrderIndex(right[0])
      if (byOrder !== 0) {
        return byOrder
      }

      return left[0].localeCompare(right[0])
    }).map(([sectionName, items]) => {
      const sortedItems = [...items].sort((leftItem, rightItem) => {
        if (sectionName === 'DE LA BARRA DE CAFE') {
          const byCafeType = CAFE_CATEGORIES.indexOf(leftItem._sourceCategory) - CAFE_CATEGORIES.indexOf(rightItem._sourceCategory)
          if (byCafeType !== 0) {
            return byCafeType
          }
        }

        return String(leftItem?.nombre || '').localeCompare(String(rightItem?.nombre || ''))
      })

      return [sectionName, sortedItems]
    })
  }, [menuItems])
  const [openCategory, setOpenCategory] = useState('')

  useEffect(() => {
    if (!groupedMenu.length) {
      setOpenCategory('')
      return
    }

    const exists = groupedMenu.some(([categoryName]) => categoryName === openCategory)

    if (!exists) {
      setOpenCategory(groupedMenu[0][0])
    }
  }, [groupedMenu, openCategory])

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

      <div className="glass-scrollbar min-h-0 flex-1 overflow-auto px-4 sm:px-5 pb-5 pt-4">
        {groupedMenu.length ? (
          <div className="space-y-4">
            {groupedMenu.map(([categoryName, items]) => {
              const isOpen = openCategory === categoryName

              return (
                <section key={categoryName} className="overflow-hidden rounded-3xl border border-white/10 bg-slate-950/45">
                  <button
                    type="button"
                    onClick={() => setOpenCategory((current) => (current === categoryName ? '' : categoryName))}
                    className={`flex w-full items-center justify-between gap-3 px-4 py-4 text-left transition ${
                      isOpen ? 'bg-cyan-400/12' : 'hover:bg-white/5'
                    }`}
                  >
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.24em] text-cyan-200">Seccion</p>
                      <h3 className="mt-1 text-base sm:text-lg font-semibold text-white">{categoryName}</h3>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200">
                        {items.length} items
                      </span>
                      <ChevronDown className={`h-4 w-4 text-slate-300 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    </div>
                  </button>

                  {isOpen ? (
                    <div className="space-y-3 border-t border-white/10 p-4">
                      {items.map((item) => (
                        <article key={item._id} className="rounded-[24px] border border-white/10 bg-slate-900/50 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-cyan-300/15 bg-gradient-to-br from-cyan-400/20 via-sky-400/10 to-transparent text-sm font-semibold text-cyan-100">
                                {getThumbnailLabel(item.nombre)}
                              </div>
                              <div>
                                <h4 className="text-base font-semibold text-white">{item.nombre}</h4>
                                <p className="mt-1 text-sm text-slate-400">{item._sourceCategory || categoryName}</p>
                              </div>
                            </div>
                            <span className="text-sm font-semibold text-cyan-100">{formatCurrency(item.precio)}</span>
                          </div>

                          <p className="mt-3 text-sm text-slate-300">{item.descripcion || 'Sin descripcion'}</p>

                          <div className="mt-4 flex flex-wrap gap-2">
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
                      ))}
                    </div>
                  ) : null}
                </section>
              )
            })}
          </div>
        ) : (
          <div className="rounded-3xl border border-white/10 bg-slate-950/45 px-4 py-10 text-center text-sm text-slate-400">
            No hay platos cargados todavia.
          </div>
        )}
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