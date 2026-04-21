import { useEffect } from 'react'
import { X } from 'lucide-react'

function ModalShell({
  open,
  onClose,
  eyebrow,
  title,
  description,
  children,
  footer,
  position = 'center',
}) {
  useEffect(() => {
    if (!open) {
      return undefined
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function handleEscape(event) {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleEscape)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleEscape)
    }
  }, [onClose, open])

  if (!open) {
    return null
  }

  const isRight = position === 'right'

  return (
    <div className={`fixed inset-0 z-50 flex ${isRight ? 'justify-end' : 'items-center justify-center'} bg-slate-950/70 p-[2.5vw] sm:p-4 backdrop-blur-sm`}>
      <button type="button" aria-label="Cerrar" className="absolute inset-0" onClick={onClose} />

      <div
        className={`relative z-10 flex w-[95vw] max-h-[90vh] flex-col overflow-hidden border border-white/10 bg-slate-900/85 shadow-2xl backdrop-blur-md ${
          isRight ? 'h-full max-w-xl rounded-[28px] sm:rounded-[32px] sm:rounded-r-none sm:rounded-l-[32px]' : 'max-w-2xl rounded-[28px] sm:rounded-[32px]'
        }`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-400/10 via-transparent to-cyan-100/5" />
        <div className="relative sticky top-0 z-10 border-b border-white/10 bg-slate-900/90 px-4 sm:px-6 py-3 sm:py-4 backdrop-blur-md">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.28em] text-cyan-200">{eyebrow}</p>
              <h3 className="mt-2 text-xl sm:text-2xl font-semibold text-white">{title}</h3>
              {description ? <p className="mt-2 max-w-xl text-sm md:text-base leading-6 text-slate-300">{description}</p> : null}
            </div>

            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-200 transition hover:border-cyan-300/40 hover:bg-cyan-400/10 hover:text-cyan-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="glass-scrollbar relative flex-1 overflow-y-auto px-4 sm:px-6 py-4 sm:py-5">{children}</div>

        {footer ? (
          <div className="relative sticky bottom-0 z-10 border-t border-white/10 bg-slate-900/95 px-4 sm:px-6 py-3 sm:py-4 backdrop-blur-md">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default ModalShell