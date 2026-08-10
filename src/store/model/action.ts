import { listModels } from '@/core/api'
import { storageDataPrefix } from '@/config/constant'
import { getData, saveData } from '@/plugins/storage'
import stationAction from '@/store/station/action'
import stationState from '@/store/station/state'
import state from './state'

const cacheKey = (stationId: string) => `${storageDataPrefix.modelsCache}_${stationId}`

export default {
  async loadCache() {
    let changed = false
    for (const station of stationState.stations) {
      const cached =
        (await getData<LX.ModelInfo[]>(cacheKey(station.id))) ||
        (station.id === stationState.defaultId
          ? await getData<LX.ModelInfo[]>(storageDataPrefix.modelsCache)
          : null)
      if (cached?.length) {
        state.modelsByStation[station.id] = cached
        changed = true
      }
    }
    if (changed) {
      global.state_event.modelsUpdated()
    }
  },

  async refresh(stationId?: string | null) {
    const station = stationAction.getById(stationId) || stationAction.getDefault()
    if (!station) throw new Error('请先配置中转站')

    state.loadingByStation[station.id] = true
    state.errorByStation[station.id] = null
    global.state_event.modelsUpdated()
    try {
      const models = await listModels(station.id)
      state.modelsByStation[station.id] = models
      await saveData(cacheKey(station.id), models)
      if (!station.defaultModel && models[0]) {
        await stationAction.updateStation(station.id, { defaultModel: models[0].id })
      }
      state.errorByStation[station.id] = null
      return models
    } catch (err: any) {
      state.errorByStation[station.id] = err?.message || '加载模型失败'
      throw err
    } finally {
      state.loadingByStation[station.id] = false
      global.state_event.modelsUpdated()
    }
  },
}
