type ThemeDef = {
  id: string
  name: string
  isDark: boolean
  colors: LX.ThemeColors
}

const themes: ThemeDef[] = [
  {
    id: 'blue',
    name: '晴空蓝',
    isDark: false,
    colors: {
      primary: '#3B82F6',
      primaryDark: '#2563EB',
      background: '#F1F5F9',
      surface: '#FFFFFF',
      surfaceSecondary: '#E2E8F0',
      border: '#CBD5E1',
      text: '#0F172A',
      textSecondary: '#64748B',
      textInverse: '#FFFFFF',
      userBubble: '#3B82F6',
      assistantBubble: '#FFFFFF',
      error: '#EF4444',
      success: '#22C55E',
      inputBg: '#FFFFFF',
    },
  },
  {
    id: 'green',
    name: '青竹',
    isDark: false,
    colors: {
      primary: '#10B981',
      primaryDark: '#059669',
      background: '#ECFDF5',
      surface: '#FFFFFF',
      surfaceSecondary: '#D1FAE5',
      border: '#A7F3D0',
      text: '#064E3B',
      textSecondary: '#047857',
      textInverse: '#FFFFFF',
      userBubble: '#10B981',
      assistantBubble: '#FFFFFF',
      error: '#EF4444',
      success: '#22C55E',
      inputBg: '#FFFFFF',
    },
  },
  {
    id: 'dark',
    name: '暗夜',
    isDark: true,
    colors: {
      primary: '#60A5FA',
      primaryDark: '#3B82F6',
      background: '#0F172A',
      surface: '#1E293B',
      surfaceSecondary: '#334155',
      border: '#475569',
      text: '#F8FAFC',
      textSecondary: '#94A3B8',
      textInverse: '#0F172A',
      userBubble: '#2563EB',
      assistantBubble: '#1E293B',
      error: '#F87171',
      success: '#4ADE80',
      inputBg: '#334155',
    },
  },
]

export const getThemeById = (id: string): LX.ActiveTheme => {
  const found = themes.find((t) => t.id === id) || themes[0]
  return {
    id: found.id,
    name: found.name,
    isDark: found.isDark,
    colors: found.colors,
  }
}

export const themeList = themes.map((t) => ({ id: t.id, name: t.name, isDark: t.isDark }))

export default themes
