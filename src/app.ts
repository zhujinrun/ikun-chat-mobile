import '@/config/globalData'
import { listenLaunchEvent } from '@/navigation/regLaunchedEvent'
import { exitApp } from '@/utils/nativeModules/utils'
import { Alert } from 'react-native'

console.log('starting app...')
listenLaunchEvent()

void (async () => {
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
        Alert.alert('初始化失败', err?.stack || err?.message || String(err), [
          { text: '退出', onPress: () => exitApp() },
        ])
      }
    })
  } catch (err: any) {
    Alert.alert('启动失败', err?.stack || err?.message || String(err), [
      { text: '退出', onPress: () => exitApp() },
    ])
  }
})()
