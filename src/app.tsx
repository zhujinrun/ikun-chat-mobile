import React, { useEffect, useState } from 'react'
import { ActivityIndicator, Alert, AppState, StyleSheet, Text, View } from 'react-native'
import { logLastCrashReportIfAny } from '@/utils/errorHandle'
import '@/config/globalData'
import { AppNavigator, navigations } from '@/navigation'
import { exitApp } from '@/utils/nativeModules/utils'
import { shouldRepairNavigationOnAppStateChange } from '@/utils/appResumeRepair'
import { Provider } from '@/store/Provider'
import RootErrorBoundary from '@/components/common/RootErrorBoundary'
import { useTheme } from '@/store/theme/hook'

console.log('starting app...')

let appState = AppState.currentState

const BootScreen = () => {
  const theme = useTheme()
  const colors = theme.colors

  return (
    <View style={[styles.bootRoot, { backgroundColor: colors.background }]}>
      <ActivityIndicator color={colors.primary} />
      <Text style={[styles.bootText, { color: colors.textSecondary }]}>正在启动...</Text>
    </View>
  )
}

const AppContent = () => {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let disposed = false
    let handlePushedHomeScreen: () => void | Promise<void> = () => {}

    const boot = async () => {
      try {
        const { default: init } = await import('@/core/init')
        handlePushedHomeScreen = await init()
        if (disposed) return
        setReady(true)
        void handlePushedHomeScreen()
      } catch (err: any) {
        if (disposed) return
        console.error('[app] init failed', err)
        Alert.alert('初始化失败', err?.stack || err?.message || String(err), [
          { text: '退出', onPress: () => exitApp() },
        ])
      }
    }

    void boot()

    return () => {
      disposed = true
    }
  }, [])

  useEffect(() => {
    if (!ready) return undefined

    const subscription = AppState.addEventListener('change', (nextState) => {
      const prevState = appState
      appState = nextState
      if (!shouldRepairNavigationOnAppStateChange(prevState, nextState)) return

      setTimeout(() => {
        void navigations.pushHomeScreen().catch((err) => {
          console.warn('[app] resume repair failed', err)
        })
      }, 120)
    })

    return () => {
      subscription.remove()
    }
  }, [ready])

  useEffect(() => {
    void (async () => {
      try {
        await logLastCrashReportIfAny()
      } catch (err) {
        console.warn('[app] logLastCrashReportIfAny failed', err)
      }
    })()
  }, [])

  return ready ? <AppNavigator /> : <BootScreen />
}

const App = () => (
  <RootErrorBoundary>
    <Provider>
      <AppContent />
    </Provider>
  </RootErrorBoundary>
)

const styles = StyleSheet.create({
  bootRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bootText: {
    marginTop: 12,
    fontSize: 14,
  },
})

export default App
