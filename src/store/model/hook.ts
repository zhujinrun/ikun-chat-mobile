import { useEffect, useState } from 'react'
import stationState from '@/store/station/state'
import state from './state'

const getStationId = (stationId?: string | null) =>
  stationId || stationState.defaultId || stationState.stations[0]?.id || ''

export const useModels = (stationId?: string | null) => {
  const initialStationId = getStationId(stationId)
  const [models, setModels] = useState(state.modelsByStation[initialStationId] || [])
  const [loading, setLoading] = useState(!!state.loadingByStation[initialStationId])
  const [error, setError] = useState(state.errorByStation[initialStationId] || null)

  useEffect(() => {
    const handler = () => {
      const id = getStationId(stationId)
      setModels([...(state.modelsByStation[id] || [])])
      setLoading(!!state.loadingByStation[id])
      setError(state.errorByStation[id] || null)
    }
    global.state_event.on('modelsUpdated', handler)
    global.state_event.on('apiStationsUpdated', handler)
    handler()
    return () => {
      global.state_event.off('modelsUpdated', handler)
      global.state_event.off('apiStationsUpdated', handler)
    }
  }, [stationId])

  return { models, loading, error }
}
