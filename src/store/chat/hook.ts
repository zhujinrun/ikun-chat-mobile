import { useEffect, useState } from 'react'
import state from './state'

export const useStreaming = () => {
  const [streaming, setStreaming] = useState(state.streaming)
  useEffect(() => {
    const handler = () => setStreaming(state.streaming)
    global.state_event.on('streamingUpdated', handler)
    return () => {
      global.state_event.off('streamingUpdated', handler)
    }
  }, [])
  return streaming
}

/** 当前正在流式写入的 assistant 消息 id */
export const useStreamingMessageId = () => {
  const [id, setId] = useState(state.streamingMessageId)
  useEffect(() => {
    const handler = () => setId(state.streamingMessageId)
    global.state_event.on('streamingUpdated', handler)
    return () => {
      global.state_event.off('streamingUpdated', handler)
    }
  }, [])
  return id
}
