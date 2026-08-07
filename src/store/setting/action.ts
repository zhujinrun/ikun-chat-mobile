import { updateSetting as mergeSetting } from '@/config/setting'
import state from './state'

export default {
  initSetting(newSetting: LX.AppSetting) {
    state.setting = newSetting
    global.lx.setting = newSetting
  },
  updateSetting(newSetting: Partial<LX.AppSetting>) {
    const result = mergeSetting(newSetting)
    state.setting = result.setting
    global.state_event.configUpdated(result.updatedSettingKeys, result.updatedSetting)
  },
}
