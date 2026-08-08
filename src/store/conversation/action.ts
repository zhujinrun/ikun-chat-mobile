import { storageDataPrefix } from '@/config/constant'
import { getData, removeData, saveData } from '@/plugins/storage'
import { createId } from '@/utils/id'
import settingState from '@/store/setting/state'
import state from './state'

const persistConversations = async () => {
  try {
    await saveData(storageDataPrefix.conversations, {
      list: state.conversations,
      activeId: state.activeId,
    })
  } catch (err) {
    console.error('[conversation.persistConversations] failed', err)
  }
}

const writeMessagesToStorage = async (conversationId: string) => {
  try {
    await saveData(
      `${storageDataPrefix.messages}${conversationId}`,
      state.messages[conversationId] || []
    )
  } catch (err) {
    console.error('[conversation.writeMessages] failed', conversationId, err)
  }
}

/** 流式输出时节流 UI 通知，避免每个 token setState 打崩 RN */
const pendingMessageEmitIds = new Set<string>()
let messageEmitTimer: ReturnType<typeof setTimeout> | null = null

const emitMessagesUpdatedNow = (conversationId: string) => {
  try {
    global.state_event.messagesUpdated(conversationId)
  } catch (err) {
    console.error('[conversation.messagesUpdated] emit failed', err)
  }
}

const scheduleMessagesUpdated = (conversationId: string) => {
  pendingMessageEmitIds.add(conversationId)
  if (messageEmitTimer != null) return
  messageEmitTimer = setTimeout(() => {
    messageEmitTimer = null
    const ids = [...pendingMessageEmitIds]
    pendingMessageEmitIds.clear()
    for (const id of ids) emitMessagesUpdatedNow(id)
  }, 64)
}

const flushScheduledMessagesUpdated = (conversationId?: string) => {
  if (messageEmitTimer != null) {
    clearTimeout(messageEmitTimer)
    messageEmitTimer = null
  }
  if (conversationId) {
    pendingMessageEmitIds.delete(conversationId)
    emitMessagesUpdatedNow(conversationId)
    return
  }
  const ids = [...pendingMessageEmitIds]
  pendingMessageEmitIds.clear()
  for (const id of ids) emitMessagesUpdatedNow(id)
}

const sortConversations = () => {
  state.conversations.sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1
    return (b.updatedAt || 0) - (a.updatedAt || 0)
  })
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v)

const sanitizeAttachments = (raw: unknown): LX.ChatAttachment[] | undefined => {
  if (!Array.isArray(raw)) return undefined
  const list: LX.ChatAttachment[] = []
  for (const item of raw) {
    if (!isRecord(item)) continue
    const type = item.type === 'image' ? 'image' : null
    const uri = typeof item.uri === 'string' ? item.uri.trim() : ''
    const dataUrl = typeof item.dataUrl === 'string' ? item.dataUrl.trim() : undefined
    const mimeType =
      typeof item.mimeType === 'string' && item.mimeType.trim()
        ? item.mimeType.trim()
        : 'image/jpeg'
    if (!type || (!uri && !dataUrl)) continue
    list.push({
      id: typeof item.id === 'string' && item.id ? item.id : createId('att_'),
      type,
      uri: uri || dataUrl || '',
      mimeType,
      name: typeof item.name === 'string' && item.name ? item.name : undefined,
      size: typeof item.size === 'number' && item.size >= 0 ? item.size : undefined,
      width: typeof item.width === 'number' && item.width > 0 ? item.width : undefined,
      height: typeof item.height === 'number' && item.height > 0 ? item.height : undefined,
      dataUrl,
    })
  }
  return list.length ? list : undefined
}

/** 消毒会话列表，避免脏数据导致启动崩溃 */
const sanitizeConversations = (raw: unknown): LX.Conversation[] => {
  if (!Array.isArray(raw)) return []
  const list: LX.Conversation[] = []
  for (const item of raw) {
    if (!isRecord(item)) continue
    const id = typeof item.id === 'string' ? item.id : ''
    if (!id) continue
    list.push({
      id,
      title: typeof item.title === 'string' && item.title ? item.title : '新对话',
      model: typeof item.model === 'string' ? item.model : '',
      systemPrompt: typeof item.systemPrompt === 'string' ? item.systemPrompt : undefined,
      pinned: typeof item.pinned === 'boolean' ? item.pinned : false,
      createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
      updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : Date.now(),
    })
  }
  return list
}

/** 消毒消息列表 */
const sanitizeMessages = (raw: unknown, conversationId: string): LX.ChatMessage[] => {
  if (!Array.isArray(raw)) return []
  const list: LX.ChatMessage[] = []
  const validRoles = new Set(['system', 'user', 'assistant', 'error'])
  for (const item of raw) {
    if (!isRecord(item)) continue
    const id = typeof item.id === 'string' ? item.id : createId('m_')
    const role = typeof item.role === 'string' && validRoles.has(item.role)
      ? (item.role as LX.ChatRole)
      : 'assistant'
    list.push({
      id,
      conversationId:
        typeof item.conversationId === 'string' ? item.conversationId : conversationId,
      role,
      content: typeof item.content === 'string' ? item.content : String(item.content ?? ''),
      attachments: sanitizeAttachments(item.attachments),
      createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
    })
  }
  return list
}

export default {
  async load() {
    try {
      const data = await getData<{ list: LX.Conversation[]; activeId: string | null }>(
        storageDataPrefix.conversations
      )
      const list = sanitizeConversations(data?.list)
      state.conversations = list
      const activeFromStore = typeof data?.activeId === 'string' ? data.activeId : null
      state.activeId =
        (activeFromStore && list.some((c) => c.id === activeFromStore) && activeFromStore) ||
        list[0]?.id ||
        null
      sortConversations()

      if (state.activeId) {
        await this.loadMessages(state.activeId)
      }
    } catch (err) {
      console.error('[conversation.load] failed, reset local chat data', err)
      state.conversations = []
      state.activeId = null
      state.messages = {}
      try {
        await removeData(storageDataPrefix.conversations)
      } catch {
        // ignore
      }
    }
    global.state_event.conversationsUpdated()
    global.state_event.activeConversationChanged(state.activeId)
  },

  async loadMessages(conversationId: string) {
    if (!conversationId) return []
    // 注意：空数组 [] 也是已加载，不能用 truthy 判断
    if (Object.prototype.hasOwnProperty.call(state.messages, conversationId)) {
      return state.messages[conversationId]
    }
    try {
      const raw = await getData<unknown>(`${storageDataPrefix.messages}${conversationId}`)
      state.messages[conversationId] = sanitizeMessages(raw, conversationId)
    } catch (err) {
      console.error('[conversation.loadMessages] failed', conversationId, err)
      state.messages[conversationId] = []
    }
    global.state_event.messagesUpdated(conversationId)
    return state.messages[conversationId]
  },

  async createConversation(title = '新对话', model?: string) {
    const now = Date.now()
    const conversation: LX.Conversation = {
      id: createId('c_'),
      title,
      model: model || settingState.setting['api.defaultModel'] || '',
      createdAt: now,
      updatedAt: now,
    }
    state.conversations.unshift(conversation)
    state.messages[conversation.id] = []
    state.activeId = conversation.id
    await persistConversations()
    await writeMessagesToStorage(conversation.id)
    global.state_event.conversationsUpdated()
    global.state_event.activeConversationChanged(conversation.id)
    return conversation
  },

  async setActive(id: string | null) {
    state.activeId = id
    if (id) await this.loadMessages(id)
    await persistConversations()
    global.state_event.activeConversationChanged(id)
  },

  async rename(id: string, title: string) {
    const item = state.conversations.find((c) => c.id === id)
    if (!item) return
    item.title = title.trim() || item.title
    item.updatedAt = Date.now()
    sortConversations()
    await persistConversations()
    global.state_event.conversationsUpdated()
  },

  async remove(id: string) {
    state.conversations = state.conversations.filter((c) => c.id !== id)
    delete state.messages[id]
    await removeData(`${storageDataPrefix.messages}${id}`)
    if (state.activeId === id) {
      state.activeId = state.conversations[0]?.id || null
      if (state.activeId) await this.loadMessages(state.activeId)
    }
    await persistConversations()
    global.state_event.conversationsUpdated()
    global.state_event.activeConversationChanged(state.activeId)
  },

  async updateConversation(id: string, patch: Partial<LX.Conversation>) {
    const item = state.conversations.find((c) => c.id === id)
    if (!item) return
    Object.assign(item, patch, { updatedAt: Date.now() })
    // 显式清除可选字段（JSON 持久化时 undefined 需删掉）
    if ('systemPrompt' in patch && patch.systemPrompt === undefined) {
      delete item.systemPrompt
    }
    sortConversations()
    await persistConversations()
    global.state_event.conversationsUpdated()
  },

  async addMessage(message: Omit<LX.ChatMessage, 'id' | 'createdAt'> & { id?: string }) {
    const list = state.messages[message.conversationId] || []
    const full: LX.ChatMessage = {
      id: message.id || createId('m_'),
      conversationId: message.conversationId,
      role: message.role,
      content: message.content,
      attachments: message.attachments?.length ? message.attachments : undefined,
      createdAt: Date.now(),
    }
    list.push(full)
    state.messages[message.conversationId] = list

    const conv = state.conversations.find((c) => c.id === message.conversationId)
    if (conv) {
      conv.updatedAt = Date.now()
      if (
        message.role === 'user' &&
        (conv.title === '新对话' || conv.title === 'New Chat') &&
        (message.content.trim() || message.attachments?.length)
      ) {
        conv.title = (message.content.trim() || '图片消息').slice(0, 30)
      }
      sortConversations()
      await persistConversations()
    }

    await writeMessagesToStorage(message.conversationId)
    global.state_event.messagesUpdated(message.conversationId)
    global.state_event.conversationsUpdated()
    return full
  },

  /**
   * 更新消息内容。
   * @param persist 是否立刻写盘；流式输出时应传 false，结束时再 flushMessages
   */
  async updateMessageContent(
    conversationId: string,
    messageId: string,
    content: string,
    persist = true
  ) {
    const list = state.messages[conversationId]
    if (!list) return
    const msg = list.find((m) => m.id === messageId)
    if (!msg) return
    msg.content = typeof content === 'string' ? content : String(content ?? '')
    if (persist) {
      // 落盘前先把节流队列刷出去，保证 UI 与磁盘一致
      flushScheduledMessagesUpdated(conversationId)
      await writeMessagesToStorage(conversationId)
    } else {
      scheduleMessagesUpdated(conversationId)
    }
  },

  /** 将某会话消息立刻持久化（流式结束后调用） */
  async flushMessages(conversationId: string) {
    if (!conversationId) return
    try {
      flushScheduledMessagesUpdated(conversationId)
      await writeMessagesToStorage(conversationId)
    } catch (err) {
      console.error('[conversation.flushMessages] failed', conversationId, err)
    }
  },

  /** 保留 [0, keepUntilIndex]（含），删除之后的消息 */
  async trimMessagesTo(conversationId: string, keepUntilIndex: number) {
    const list = state.messages[conversationId]
    if (!list) return
    if (keepUntilIndex < 0) {
      state.messages[conversationId] = []
    } else if (keepUntilIndex < list.length - 1) {
      state.messages[conversationId] = list.slice(0, keepUntilIndex + 1)
    } else {
      return
    }
    await writeMessagesToStorage(conversationId)
    global.state_event.messagesUpdated(conversationId)
  },

  async clearMessages(conversationId: string) {
    state.messages[conversationId] = []
    await writeMessagesToStorage(conversationId)
    global.state_event.messagesUpdated(conversationId)
  },

  getActive(): LX.Conversation | null {
    return state.conversations.find((c) => c.id === state.activeId) || null
  },

  getMessages(conversationId: string): LX.ChatMessage[] {
    return state.messages[conversationId] || []
  },
}
