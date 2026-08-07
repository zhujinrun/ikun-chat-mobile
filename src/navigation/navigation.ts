import { Navigation } from 'react-native-navigation'
import { HOME_SCREEN, SETTING_SCREEN } from './screenNames'
import themeState from '@/store/theme/state'

const statusBarStyle = (isDark: boolean) => (isDark ? 'light' : 'dark')

export async function pushHomeScreen() {
  const theme = themeState.theme
  return Navigation.setRoot({
    root: {
      stack: {
        children: [
          {
            component: {
              name: HOME_SCREEN,
              options: {
                topBar: {
                  visible: false,
                  height: 0,
                },
                statusBar: {
                  drawBehind: true,
                  visible: true,
                  style: statusBarStyle(theme.isDark),
                  backgroundColor: 'transparent',
                },
                navigationBar: {
                  backgroundColor: theme.colors.surface,
                },
                layout: {
                  componentBackgroundColor: theme.colors.background,
                },
              },
            },
          },
        ],
      },
    },
  })
}

export function pushSettingScreen(componentId: string) {
  const theme = themeState.theme
  return Navigation.push(componentId, {
    component: {
      name: SETTING_SCREEN,
      options: {
        topBar: {
          title: {
            text: '设置',
            color: theme.colors.text,
          },
          background: {
            color: theme.colors.surface,
          },
          backButton: {
            color: theme.colors.text,
          },
        },
        statusBar: {
          style: statusBarStyle(theme.isDark),
          backgroundColor: theme.colors.surface,
        },
        layout: {
          componentBackgroundColor: theme.colors.background,
        },
      },
    },
  })
}
