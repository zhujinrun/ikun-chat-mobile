import { storageDataPrefix } from '@/config/constant'
import { getData, removeData, saveData } from '@/plugins/storage'
import { createId } from '@/utils/id'
import settingState from '@/store/setting/state'
import state from './state'

const persistConversations = async () => {
  await saveData(storageDataPrefix.conversations, {
    list: state.conversations,
    activeId: state.activeId,
  })
}

const persistMessages = async (conversationId: string) => {
  await saveData(
    `${storageDataPrefix.messages}${conversationId}`,
    state.messages[conversationId] || []
  )
}

const sortConversations = () => {
  state.conversations.sort((a, b) => b.updatedAt - a.updatedAt)
}

export default {
  async load() {
    const data = await getData<{ list: LX.Conversation[]; activeId: string | null }>(
      storageDataPrefix.conversations
    )
    state.conversations = data?.list || []
    state.activeId = data?.activeId || state.conversations[0]?.id || null
    sortConversations()

    if (state.activeId) {
      await this.loadMessages(state.activeId)
    }
    global.state_event.conversationsUpdated()
  },

  async loadMessages(conversationId: string) {
    if (state.messages[conversationId]) return state.messages[conversationId]
    const list =
      (await getData<LX.ChatMessage[]>(`${storageDataPrefix.messages}${conversationId}`)) || []
    state.messages[conversationId] = list
    global.state_event.messagesUpdated(conversationId)
    return list
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
    await persistMessages(conversation.id)
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
        message.content.trim()
      ) {
        conv.title = message.content.trim().slice(0, 30)
      }
      sortConversations()
      await persistConversations()
    }

    await persistMessages(message.conversationId)
    global.state_event.messagesUpdated(message.conversationId)
    global.state_event.conversationsUpdated()
    return full
  },

  async updateMessageContent(conversationId: string, messageId: string, content: string) {
    const list = state.messages[conversationId]
    if (!list) return
    const msg = list.find((m) => m.id === messageId)
    if (!msg) return
    msg.content = content
    await persistMessages(conversationId)
    global.state_event.messagesUpdated(conversationId)
  },

  async clearMessages(conversationId: string) {
    state.messages[conversationId] = []
    await persistMessages(conversationId)
    global.state_event.messagesUpdated(conversationId)
  },

  getActive(): LX.Conversation | null {
    return state.conversations.find((c) => c.id === state.activeId) || null
  },

  getMessages(conversationId: string): LX.ChatMessage[] {
    return state.messages[conversationId] || []
  },
}
