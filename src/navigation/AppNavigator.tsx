import React, { useMemo } from 'react'
import {
  CommonActions,
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
} from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { enableScreens } from 'react-native-screens'
import ScreenHeader from '@/components/common/ScreenHeader'
import Home from '@/screens/Home'
import Setting from '@/screens/Setting'
import { useTheme } from '@/store/theme/hook'
import { HOME_SCREEN, SETTING_SCREEN } from './screenNames'
import { navigationRef } from './navigation'
import type { RootStackParamList } from './types'

enableScreens(true)

const Stack = createNativeStackNavigator<RootStackParamList>()

const AppNavigator = () => {
  const theme = useTheme()
  const colors = theme.colors

  const navigationTheme = useMemo(() => {
    const baseTheme = theme.isDark ? DarkTheme : DefaultTheme

    return {
      ...baseTheme,
      dark: theme.isDark,
      colors: {
        ...baseTheme.colors,
        primary: colors.primary,
        background: colors.background,
        card: colors.surface,
        text: colors.text,
        border: colors.border,
        notification: colors.primary,
      },
    }
  }, [colors.background, colors.border, colors.primary, colors.surface, colors.text, theme.isDark])

  return (
    <SafeAreaProvider>
      <NavigationContainer ref={navigationRef} theme={navigationTheme}>
        <Stack.Navigator
          initialRouteName={HOME_SCREEN}
          screenOptions={{
            contentStyle: { backgroundColor: colors.background },
            headerShadowVisible: false,
            animation: 'slide_from_right',
          }}
        >
          <Stack.Screen
            name={HOME_SCREEN}
            component={Home}
            options={{
              headerShown: false,
            }}
          />
          <Stack.Screen
            name={SETTING_SCREEN}
            component={Setting}
            options={({ navigation }) => ({
              header: () => (
                <ScreenHeader
                  title="设置"
                  onBack={() => {
                    if (navigation.canGoBack()) {
                      navigation.goBack()
                      return
                    }
                    navigation.dispatch(
                      CommonActions.reset({
                        index: 0,
                        routes: [{ name: HOME_SCREEN }],
                      })
                    )
                  }}
                />
              ),
              headerStyle: { backgroundColor: colors.surface },
              headerTintColor: colors.text,
              headerTitleStyle: { fontWeight: '600' },
              contentStyle: { backgroundColor: colors.background },
              statusBarBackgroundColor: 'transparent',
              statusBarStyle: theme.isDark ? 'light' : 'dark',
              statusBarTranslucent: true,
            })}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  )
}

export default AppNavigator
