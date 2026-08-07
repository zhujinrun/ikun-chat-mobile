import { memo, useEffect, useState } from 'react'
import themeState from '@/store/theme/state'
import { ThemeContext } from '@/store/theme/hook'

export default memo(({ children }: { children: React.ReactNode }) => {
  const [theme, setTheme] = useState(themeState.theme)

  useEffect(() => {
    const handleUpdateTheme = (next: LX.ActiveTheme) => {
      setTheme(next)
    }
    global.state_event.on('themeUpdated', handleUpdateTheme)
    return () => {
      global.state_event.off('themeUpdated', handleUpdateTheme)
    }
  }, [])

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
})
