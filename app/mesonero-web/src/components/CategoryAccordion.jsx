import { useEffect, useState } from 'react'

function CategoryAccordion({
  categoryName,
  items,
  onItemSelect,
  formatPrice,
  defaultOpen = false,
  onCategoryOpen,
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  useEffect(() => {
    setIsOpen(defaultOpen)
  }, [defaultOpen, categoryName])

  function handleToggle() {
    setIsOpen((current) => {
      const nextOpen = !current
      if (nextOpen && typeof onCategoryOpen === 'function') {
        onCategoryOpen(categoryName)
      }
      return nextOpen
    })
  }

  return (
    <section className="overflow-hidden rounded-[24px] border border-[#C0C0C0]/40 bg-[#0B0F1A]">
      <button
        type="button"
        onClick={handleToggle}
        className="flex w-full items-center justify-between gap-3 bg-[#0E1422] px-5 py-4 text-left transition-all duration-300 hover:bg-[#131A2B]"
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#C0C0C0]">Categoria</p>
          <h3
            className={`mt-1 font-display text-xl font-semibold transition-all duration-300 ${
              isOpen ? 'text-[#D4AF37]' : 'text-snowText'
            }`}
          >
            {categoryName}
          </h3>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-[0.24em] text-[#C0C0C0]">Items</p>
          <p className="mt-1 text-sm font-semibold text-snowText">{items.length}</p>
        </div>
      </button>

      <div
        className={`overflow-hidden border-t border-[#C0C0C0]/30 transition-all duration-300 ease-in-out ${
          isOpen ? 'max-h-[1200px] opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="grid gap-3 px-4 py-4 sm:grid-cols-2 sm:px-5">
          {items.map((item) => (
            <button
              key={item._id || item.name}
              type="button"
              onClick={() => onItemSelect(item, categoryName)}
              className="group luxury-hover-lift rounded-[20px] border border-[#C0C0C0]/30 bg-[#121826] p-4 text-left transition-all duration-300 hover:-translate-y-0.5 hover:border-[#D4AF37]/70"
            >
              <span className="inline-flex rounded-full border border-[#C0C0C0]/40 bg-[#0B0F1A] px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-[#E5E7EB]">
                {item.type === 'dish' ? 'Personalizable' : 'Rapido'}
              </span>
              <div className="mt-4 flex items-end justify-between gap-3">
                <div>
                  <h4 className="font-display text-xl font-semibold text-snowText">{item.name}</h4>
                  <p className="mt-2 text-sm text-slate-300">
                    {item.description || 'Pasa al paso 3 para elegir una nota rapida.'}
                  </p>
                  {categoryName === 'DE LA BARRA DE CAFE' && item.sourceCategory ? (
                    <p className="mt-2 text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                      {item.sourceCategory}
                    </p>
                  ) : null}
                </div>
                <p className="text-base font-semibold text-[#D4AF37]">{formatPrice(item.price)}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}

export default CategoryAccordion