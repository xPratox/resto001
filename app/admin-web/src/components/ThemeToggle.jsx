function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 2.75v2.5" />
      <path d="M12 18.75v2.5" />
      <path d="M21.25 12h-2.5" />
      <path d="M5.25 12h-2.5" />
      <path d="m18.54 5.46-1.77 1.77" />
      <path d="m7.23 16.77-1.77 1.77" />
      <path d="m18.54 18.54-1.77-1.77" />
      <path d="m7.23 7.23-1.77-1.77" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20.25 14.14A8.75 8.75 0 0 1 9.86 3.75 8.75 8.75 0 1 0 20.25 14.14Z" />
    </svg>
  )
}

function ThemeToggle({ theme, onToggle, compact = false }) {
  const nextTheme = theme === 'dark' ? 'light' : 'dark'
  const label = nextTheme === 'light' ? 'Modo claro' : 'Modo oscuro'

  return (
    <button
      type="button"
      onClick={onToggle}
      className={`theme-toggle${compact ? ' theme-toggle--compact' : ''}`}
      aria-label={`Cambiar a ${label.toLowerCase()}`}
      title={`Cambiar a ${label.toLowerCase()}`}
    >
      <span className="theme-toggle__icon">
        {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
      </span>
      {compact ? null : <span className="theme-toggle__label">{label}</span>}
    </button>
  )
}

export default ThemeToggle
