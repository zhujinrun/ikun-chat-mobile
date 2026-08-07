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
