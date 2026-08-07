import { initSetting } from '@/config/setting'
import settingAction from '@/store/setting/action'
import themeAction from '@/store/theme/action'
import conversationAction from '@/store/conversation/action'
import modelAction from '@/store/model/action'
import { StatusBar, Platform } from 'react-native'

export default async () => {
  let setting: LX.AppSetting
  try {
    setting = await initSetting()
  } catch (err) {
    console.error('[init] setting failed', err)
    const { default: defaultSetting } = await import('@/config/defaultSetting')
    setting = { ...defaultSetting }
  }

  settingAction.initSetting(setting)
  try {
    themeAction.applyTheme(setting['theme.id'])
  } catch (err) {
    console.error('[init] theme failed', err)
  }
  global.lx.fontSize = setting['common.fontSize'] || 16

  if (Platform.OS === 'android') {
    try {
      StatusBar.setTranslucent(true)
      StatusBar.setBackgroundColor('transparent')
    } catch {
      // ignore
    }
  }

  // 会话加载失败不得阻断进入首页
  try {
    await conversationAction.load()
  } catch (err) {
    console.error('[init] conversation load failed', err)
  }

  try {
    await modelAction.loadCache()
  } catch (err) {
    console.error('[init] model cache failed', err)
  }

  // 若已配置 API，后台尝试刷新模型（失败忽略）
  if (setting['api.baseUrl'] && setting['api.apiKey']) {
    void modelAction.refresh().catch((err) => {
      console.warn('[init] model refresh failed', err?.message || err)
    })
  }

  return () => {
    // after home pushed
  }
}
