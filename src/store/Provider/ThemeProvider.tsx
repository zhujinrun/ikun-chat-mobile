import { memo, useEffect, useState } from 'react'
import { Appearance } from 'react-native'
import { SYSTEM_THEME_ID } from '@/theme/themes'
import themeState from '@/store/theme/state'
import settingState from '@/store/setting/state'
import themeAction from '@/store/theme/action'
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

  useEffect(() => {
    const subscription = Appearance.addChangeListener(() => {
      if (settingState.setting['theme.id'] === SYSTEM_THEME_ID) {
        themeAction.applyTheme(SYSTEM_THEME_ID)
      }
    })
    return () => {
      subscription.remove()
    }
  }, [])

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
})
