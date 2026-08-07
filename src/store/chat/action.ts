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

    const model = conv.model || settingState.setting['api.defaultModel']
    if (!model) {
      throw new Error('请先选择模型（设置中配置 API 并刷新模型列表）')
    }

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
            void conversationAction.updateMessageContent(conv!.id, assistant.id, full)
          },
          onDone: () => {
            if (!full) {
              void conversationAction.updateMessageContent(
                conv!.id,
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
  },
}
