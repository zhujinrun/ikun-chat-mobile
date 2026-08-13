import assert from 'node:assert/strict'
import stationAction from './action'
import stationState from './state'
import conversationState from '@/store/conversation/state'

declare const describe: (name: string, fn: () => void) => void
declare const it: (name: string, fn: () => void | Promise<void>) => void
declare const beforeEach: (fn: () => void | Promise<void>) => void

const buildStation = (id: string, name = id): LX.ApiStation => ({
  id,
  name,
  baseUrl: `https://${id}.example.com/v1`,
  apiKey: 'sk-test',
  extraHeaders: '',
  defaultModel: 'gpt-test',
  endpointMode: 'chat_completions',
  fileHandling: 'local_extract',
  createdAt: 1,
  updatedAt: 1,
})

const buildConversation = (stationId: string): LX.Conversation => ({
  id: `conv_${stationId}`,
  title: '测试会话',
  stationId,
  model: 'gpt-test',
  createdAt: 1,
  updatedAt: 1,
})

describe('stationAction.removeStation', () => {
  let updateCount = 0

  beforeEach(() => {
    const testGlobal = global as any
    updateCount = 0
    testGlobal.__mockAsyncStorage.reset()
    testGlobal.state_event = {
      apiStationsUpdated: () => {
        updateCount += 1
      },
    }
    stationState.stations = [buildStation('st_default', '默认中转站')]
    stationState.defaultId = 'st_default'
    conversationState.conversations = []
    conversationState.activeId = null
    conversationState.messages = {}
  })

  it('blocks deleting the only station', async () => {
    await assert.rejects(
      () => stationAction.removeStation('st_default'),
      /至少保留一个中转站/
    )

    assert.deepEqual(
      stationState.stations.map((station) => station.id),
      ['st_default']
    )
    assert.equal(stationState.defaultId, 'st_default')
    assert.equal(updateCount, 0)
  })

  it('blocks deleting the default station', async () => {
    stationState.stations = [buildStation('st_default', '默认中转站'), buildStation('st_other')]

    await assert.rejects(
      () => stationAction.removeStation('st_default'),
      /默认中转站不能删除/
    )

    assert.deepEqual(
      stationState.stations.map((station) => station.id),
      ['st_default', 'st_other']
    )
    assert.equal(stationState.defaultId, 'st_default')
    assert.equal(updateCount, 0)
  })

  it('blocks deleting a station used by conversations', async () => {
    stationState.stations = [buildStation('st_default', '默认中转站'), buildStation('st_used')]
    conversationState.conversations = [buildConversation('st_used')]

    await assert.rejects(
      () => stationAction.removeStation('st_used'),
      /该中转站已有会话使用，暂不能删除/
    )

    assert.deepEqual(
      stationState.stations.map((station) => station.id),
      ['st_default', 'st_used']
    )
    assert.equal(updateCount, 0)
  })

  it('removes an unused non-default station', async () => {
    stationState.stations = [buildStation('st_default', '默认中转站'), buildStation('st_unused')]

    await stationAction.removeStation('st_unused')

    assert.deepEqual(
      stationState.stations.map((station) => station.id),
      ['st_default']
    )
    assert.equal(stationState.defaultId, 'st_default')
    assert.equal(updateCount, 1)
  })
})
