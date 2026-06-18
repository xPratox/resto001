import { useCallback } from 'react'

export function useTheme() {
  const theme = 'light'

  const setTheme = useCallback(() => {}, [])
  const toggleTheme = useCallback(() => {}, [])

  return {
    theme,
    isDark: false,
    setTheme,
    toggleTheme,
  }
}
