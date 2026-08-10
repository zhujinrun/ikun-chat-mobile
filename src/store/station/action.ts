import { storageDataPrefix } from '@/config/constant'
import { getData, saveData } from '@/plugins/storage'
import { createId } from '@/utils/id'
import settingState from '@/store/setting/state'
import conversationState from '@/store/conversation/state'
import state from './state'

type StoredStations = {
  list?: unknown
  defaultId?: unknown
}

const hasText = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

const timestamp = () => Date.now()

const buildLegacyStation = (): LX.ApiStation => {
  const now = timestamp()
  return {
    id: createId('st_'),
    name: '默认中转站',
    baseUrl: settingState.setting['api.baseUrl'] || '',
    apiKey: settingState.setting['api.apiKey'] || '',
    extraHeaders: settingState.setting['api.extraHeaders'] || '',
    defaultModel: settingState.setting['api.defaultModel'] || '',
    createdAt: now,
    updatedAt: now,
  }
}

const sanitizeStations = (raw: unknown): LX.ApiStation[] => {
  if (!Array.isArray(raw)) return []
  const list: LX.ApiStation[] = []
  for (const item of raw) {
    if (!isRecord(item)) continue
    const id = hasText(item.id) ? item.id.trim() : ''
    if (!id) continue
    const now = timestamp()
    list.push({
      id,
      name: hasText(item.name) ? item.name.trim() : '未命名中转站',
      baseUrl: typeof item.baseUrl === 'string' ? item.baseUrl : '',
      apiKey: typeof item.apiKey === 'string' ? item.apiKey : '',
      extraHeaders: typeof item.extraHeaders === 'string' ? item.extraHeaders : '',
      defaultModel: typeof item.defaultModel === 'string' ? item.defaultModel : '',
      createdAt: typeof item.createdAt === 'number' ? item.createdAt : now,
      updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : now,
    })
  }
  return list
}

const persist = async () => {
  await saveData(storageDataPrefix.apiStations, {
    list: state.stations,
    defaultId: state.defaultId,
  })
}

const emitUpdated = () => {
  global.state_event.apiStationsUpdated()
}

const findStation = (id?: string | null) =>
  id ? state.stations.find((item) => item.id === id) || null : null

export default {
  async load() {
    const stored = await getData<StoredStations>(storageDataPrefix.apiStations)
    const storedList = sanitizeStations(stored?.list)
    const stations = storedList.length ? storedList : [buildLegacyStation()]
    const storedDefaultId = hasText(stored?.defaultId) ? stored.defaultId.trim() : null
    const defaultId =
      (storedDefaultId && stations.some((item) => item.id === storedDefaultId) && storedDefaultId) ||
      stations[0]?.id ||
      null

    state.stations = stations
    state.defaultId = defaultId

    if (!storedList.length || storedDefaultId !== defaultId) {
      await persist()
    }

    emitUpdated()
  },

  async addStation(name?: string) {
    const now = timestamp()
    const station: LX.ApiStation = {
      id: createId('st_'),
      name: name?.trim() || `中转站 ${state.stations.length + 1}`,
      baseUrl: '',
      apiKey: '',
      extraHeaders: '',
      defaultModel: '',
      createdAt: now,
      updatedAt: now,
    }
    state.stations.push(station)
    if (!state.defaultId) state.defaultId = station.id
    await persist()
    emitUpdated()
    return station
  },

  async updateStation(id: string, patch: Partial<LX.ApiStation>) {
    const station = findStation(id)
    if (!station) throw new Error('中转站不存在')
    Object.assign(station, patch, {
      id: station.id,
      name: patch.name?.trim() || station.name,
      updatedAt: timestamp(),
    })
    await persist()
    emitUpdated()
    return station
  },

  async setDefault(id: string) {
    if (!findStation(id)) throw new Error('中转站不存在')
    state.defaultId = id
    await persist()
    emitUpdated()
  },

  async removeStation(id: string) {
    if (state.stations.length <= 1) {
      throw new Error('至少保留一个中转站')
    }
    const used = conversationState.conversations.some((item) => item.stationId === id)
    if (used) {
      throw new Error('该中转站已有会话使用，暂不能删除')
    }
    state.stations = state.stations.filter((item) => item.id !== id)
    if (state.defaultId === id) state.defaultId = state.stations[0]?.id || null
    await persist()
    emitUpdated()
  },

  getDefault() {
    return findStation(state.defaultId) || state.stations[0] || null
  },

  getById(id?: string | null) {
    return findStation(id)
  },

  getForConversation(conversation?: Pick<LX.Conversation, 'stationId'> | null) {
    return findStation(conversation?.stationId) || this.getDefault()
  },
}
