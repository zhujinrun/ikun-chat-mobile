// 全局异常：只落盘不弹窗（见 errorHandle）
import { logLastCrashReportIfAny } from '@/utils/errorHandle'
import '@/config/globalData'
import { listenLaunchEvent } from '@/navigation/regLaunchedEvent'
import { exitApp } from '@/utils/nativeModules/utils'
import { Alert } from 'react-native'

console.log('starting app...')
listenLaunchEvent()

void (async () => {
  // 有上次崩溃则仅 console 打印路径/内容，不弹 Alert，避免二次崩
  try {
    await logLastCrashReportIfAny()
  } catch (err) {
    console.warn('[app] logLastCrashReportIfAny failed', err)
  }

  try {
    const { init: initNavigation, navigations } = await import('@/navigation')
    let isInited = false
    let handlePushedHomeScreen: () => void | Promise<void> = () => {}

    const handleInit = async () => {
      if (isInited) return
      const { default: init } = await import('@/core/init')
      handlePushedHomeScreen = await init()
      isInited = true
    }

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
})()
