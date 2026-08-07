import { useEffect, useState } from 'react'
import state from './state'

export const useModels = () => {
  const [models, setModels] = useState(state.models)
  const [loading, setLoading] = useState(state.loading)
  const [error, setError] = useState(state.error)

  useEffect(() => {
    const handler = () => {
      setModels([...state.models])
      setLoading(state.loading)
      setError(state.error)
    }
    global.state_event.on('modelsUpdated', handler)
    return () => {
      global.state_event.off('modelsUpdated', handler)
    }
  }, [])

  return { models, loading, error }
}
