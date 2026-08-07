import { useContext, useEffect, useState, createContext } from 'react'
import state from './state'

export const ThemeContext = createContext<LX.ActiveTheme>(state.theme)

export const useTheme = () => useContext(ThemeContext)

export const useThemeState = () => {
  const [theme, setTheme] = useState(state.theme)
  useEffect(() => {
    const handler = (t: LX.ActiveTheme) => setTheme(t)
    global.state_event.on('themeUpdated', handler)
    return () => {
      global.state_event.off('themeUpdated', handler)
    }
  }, [])
  return theme
}
