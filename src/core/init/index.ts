import { initSetting } from '@/config/setting'
import settingAction from '@/store/setting/action'
import themeAction from '@/store/theme/action'
import conversationAction from '@/store/conversation/action'
import modelAction from '@/store/model/action'
import { StatusBar, Platform } from 'react-native'

export default async () => {
  const setting = await initSetting()
  settingAction.initSetting(setting)
  themeAction.applyTheme(setting['theme.id'])
  global.lx.fontSize = setting['common.fontSize'] || 16

  if (Platform.OS === 'android') {
    StatusBar.setTranslucent(true)
    StatusBar.setBackgroundColor('transparent')
  }

  await conversationAction.load()
  await modelAction.loadCache()

  // 若已配置 API，后台尝试刷新模型
  if (setting['api.baseUrl'] && setting['api.apiKey']) {
    void modelAction.refresh().catch(() => null)
  }

  return () => {
    // after home pushed
  }
}
