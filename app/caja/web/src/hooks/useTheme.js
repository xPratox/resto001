import { useCallback } from 'react'

export function useTheme() {
  const theme = 'light'
  const toggleTheme = useCallback(() => {}, [])

  return { theme, toggleTheme }
}
