import { useEffect, useState } from 'react'
import state from './state'

export const useConversations = () => {
  const [list, setList] = useState(state.conversations)
  useEffect(() => {
    const handler = () => setList([...state.conversations])
    global.state_event.on('conversationsUpdated', handler)
    return () => {
      global.state_event.off('conversationsUpdated', handler)
    }
  }, [])
  return list
}

export const useActiveConversationId = () => {
  const [id, setId] = useState(state.activeId)
  useEffect(() => {
    const handler = (next: string | null) => setId(next)
    global.state_event.on('activeConversationChanged', handler)
    return () => {
      global.state_event.off('activeConversationChanged', handler)
    }
  }, [])
  return id
}

const safeMessageList = (conversationId: string | null): LX.ChatMessage[] => {
  if (!conversationId) return []
  const list = state.messages[conversationId]
  return Array.isArray(list) ? [...list] : []
}

export const useMessages = (conversationId: string | null) => {
  const [messages, setMessages] = useState<LX.ChatMessage[]>(() =>
    safeMessageList(conversationId)
  )

  useEffect(() => {
    if (!conversationId) {
      setMessages([])
      return
    }
    setMessages(safeMessageList(conversationId))
    const handler = (id: string) => {
      if (id !== conversationId) return
      setMessages(safeMessageList(conversationId))
    }
    global.state_event.on('messagesUpdated', handler)
    return () => {
      global.state_event.off('messagesUpdated', handler)
    }
  }, [conversationId])

  return messages
}
