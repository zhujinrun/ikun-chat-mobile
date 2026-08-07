import { chatCompletionsStream } from '@/core/api'
import type { ApiMessage } from '@/core/api'
import conversationAction from '@/store/conversation/action'
import conversationState from '@/store/conversation/state'
import settingState from '@/store/setting/state'
import state from './state'

const buildApiMessages = (conversationId: string): ApiMessage[] => {
  const conv = conversationState.conversations.find((c) => c.id === conversationId)
  const systemPrompt = conv?.systemPrompt || settingState.setting['chat.systemPrompt']
  const history = conversationAction.getMessages(conversationId).filter((m) => m.role !== 'error')

  const messages: ApiMessage[] = []
  if (systemPrompt?.trim()) {
    messages.push({ role: 'system', content: systemPrompt.trim() })
  }
  for (const m of history) {
    if (m.role === 'user' || m.role === 'assistant') {
      messages.push({ role: m.role, content: m.content })
    }
  }
  return messages
}

const resolveModel = (conv: LX.Conversation) => {
  const model = conv.model || settingState.setting['api.defaultModel']
  if (!model) {
    throw new Error('请先选择模型（设置中配置 API 并刷新模型列表）')
  }
  return model
}

/** 对已插入的空 assistant 消息发起流式补全 */
const streamAssistantReply = async (conv: LX.Conversation, assistant: LX.ChatMessage) => {
  const model = resolveModel(conv)
  const controller = new AbortController()
  state.abortController = controller
  state.streaming = true
  state.streamingConversationId = conv.id
  state.streamingMessageId = assistant.id
  global.state_event.streamingUpdated()

  let full = ''
  try {
    const messages = buildApiMessages(conv.id)
    // 去掉刚插入的空 assistant，避免重复
    const apiMessages = messages.filter(
      (m, idx) => !(idx === messages.length - 1 && m.role === 'assistant' && !m.content)
    )

    await chatCompletionsStream(
      model,
      apiMessages,
      {
        onDelta: (delta) => {
          full += delta
          void conversationAction.updateMessageContent(conv.id, assistant.id, full)
        },
        onDone: () => {
          if (!full) {
            void conversationAction.updateMessageContent(
              conv.id,
              assistant.id,
              '（模型未返回内容）'
            )
          }
        },
      },
      controller.signal
    )
  } catch (err: any) {
    if (controller.signal.aborted) {
      if (!full) {
        await conversationAction.updateMessageContent(conv.id, assistant.id, '（已停止）')
      }
    } else {
      const msg = err?.message || '请求失败'
      if (full) {
        await conversationAction.updateMessageContent(
          conv.id,
          assistant.id,
          `${full}\n\n[错误] ${msg}`
        )
      } else {
        await conversationAction.updateMessageContent(conv.id, assistant.id, '')
        await conversationAction.addMessage({
          conversationId: conv.id,
          role: 'error',
          content: msg,
        })
      }
      throw err
    }
  } finally {
    state.streaming = false
    state.streamingConversationId = null
    state.streamingMessageId = null
    state.abortController = null
    global.state_event.streamingUpdated()
  }
}

/** 找到最后一条 user 消息下标；其后应是可被重新生成的 assistant/error */
const findLastUserIndex = (list: LX.ChatMessage[]) => {
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i].role === 'user') return i
  }
  return -1
}

export default {
  stop() {
    state.abortController?.abort()
    state.abortController = null
    state.streaming = false
    state.streamingConversationId = null
    state.streamingMessageId = null
    global.state_event.streamingUpdated()
  },

  async send(content: string) {
    const text = content.trim()
    if (!text || state.streaming) return

    let conv = conversationAction.getActive()
    if (!conv) {
      conv = await conversationAction.createConversation()
    }

    resolveModel(conv)

    await conversationAction.addMessage({
      conversationId: conv.id,
      role: 'user',
      content: text,
    })

    const assistant = await conversationAction.addMessage({
      conversationId: conv.id,
      role: 'assistant',
      content: '',
    })

    await streamAssistantReply(conv, assistant)
  },

  /**
   * 基于最后一条用户消息重新生成助手回复。
   * 会删除该 user 之后的 assistant / error 等消息，再流式请求一次。
   */
  async regenerate() {
    if (state.streaming) return

    const conv = conversationAction.getActive()
    if (!conv) {
      throw new Error('当前没有会话')
    }

    resolveModel(conv)

    const list = conversationAction.getMessages(conv.id)
    const lastUserIdx = findLastUserIndex(list)
    if (lastUserIdx < 0) {
      throw new Error('没有可重新生成的消息')
    }

    // 最后一条必须是 user 之后的回复（assistant / error），或仅剩 user（异常中断）
    const tail = list.slice(lastUserIdx + 1)
    const canRegen =
      tail.length === 0 ||
      tail.every((m) => m.role === 'assistant' || m.role === 'error')
    if (!canRegen) {
      throw new Error('当前消息无法重新生成')
    }

    await conversationAction.trimMessagesTo(conv.id, lastUserIdx)

    const assistant = await conversationAction.addMessage({
      conversationId: conv.id,
      role: 'assistant',
      content: '',
    })

    await streamAssistantReply(conv, assistant)
  },

  /** 当前会话是否可重新生成（有 user，且未在流式中） */
  canRegenerate(): boolean {
    if (state.streaming) return false
    const conv = conversationAction.getActive()
    if (!conv) return false
    const list = conversationAction.getMessages(conv.id)
    const lastUserIdx = findLastUserIndex(list)
    if (lastUserIdx < 0) return false
    const tail = list.slice(lastUserIdx + 1)
    return (
      tail.length === 0 ||
      tail.every((m) => m.role === 'assistant' || m.role === 'error')
    )
  },
}
