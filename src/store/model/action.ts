import { listModels } from '@/core/api'
import { storageDataPrefix } from '@/config/constant'
import { getData, saveData } from '@/plugins/storage'
import settingAction from '@/store/setting/action'
import settingState from '@/store/setting/state'
import state from './state'

export default {
  async loadCache() {
    const cached = await getData<LX.ModelInfo[]>(storageDataPrefix.modelsCache)
    if (cached?.length) {
      state.models = cached
      global.state_event.modelsUpdated()
    }
  },

  async refresh() {
    state.loading = true
    state.error = null
    global.state_event.modelsUpdated()
    try {
      const models = await listModels()
      state.models = models
      await saveData(storageDataPrefix.modelsCache, models)
      if (!settingState.setting['api.defaultModel'] && models[0]) {
        settingAction.updateSetting({ 'api.defaultModel': models[0].id })
      }
      state.error = null
    } catch (err: any) {
      state.error = err?.message || '加载模型失败'
      throw err
    } finally {
      state.loading = false
      global.state_event.modelsUpdated()
    }
  },
}
