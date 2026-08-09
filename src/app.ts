// 全局异常：只落盘不弹窗（见 errorHandle）
import { logLastCrashReportIfAny } from '@/utils/errorHandle'
import '@/config/globalData'
import { init as initNavigation, navigations } from '@/navigation'
import { listenLaunchEvent } from '@/navigation/regLaunchedEvent'
import { exitApp } from '@/utils/nativeModules/utils'
import { shouldRepairNavigationOnAppStateChange } from '@/utils/appResumeRepair'
import { Alert, AppState } from 'react-native'

console.log('starting app...')
listenLaunchEvent()

let isInited = false
let handlePushedHomeScreen: () => void | Promise<void> = () => {}
let appState = AppState.currentState

const handleInit = async () => {
  if (isInited) return
  const { default: init } = await import('@/core/init')
  handlePushedHomeScreen = await init()
  isInited = true
}

AppState.addEventListener('change', (nextState) => {
  const prevState = appState
  appState = nextState
  if (!isInited || !shouldRepairNavigationOnAppStateChange(prevState, nextState)) return

  setTimeout(() => {
    void navigations.pushHomeScreen().catch((err) => {
      console.warn('[app] resume repair failed', err)
    })
  }, 120)
})

try {
  initNavigation(async () => {
    try {
      await handleInit()
      if (!isInited) return
      await navigations.pushHomeScreen()
      void handlePushedHomeScreen()
    } catch (err: any) {
      // 启动失败仍尽量落盘；Alert 仅用于真正进不了首页的情况
      console.error('[app] init failed', err)
      Alert.alert('初始化失败', err?.stack || err?.message || String(err), [
        { text: '退出', onPress: () => exitApp() },
      ])
    }
  })
} catch (err: any) {
  console.error('[app] boot failed', err)
  Alert.alert('启动失败', err?.stack || err?.message || String(err), [
    { text: '退出', onPress: () => exitApp() },
  ])
}

void (async () => {
  // 有上次崩溃则仅 console 打印路径/内容，不弹 Alert，避免二次崩
  try {
    await logLastCrashReportIfAny()
  } catch (err) {
    console.warn('[app] logLastCrashReportIfAny failed', err)
  }
})()
