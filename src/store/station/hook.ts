import { useEffect, useState } from 'react'
import state from './state'

export const useStations = () => {
  const [stations, setStations] = useState(state.stations)
  const [defaultId, setDefaultId] = useState(state.defaultId)

  useEffect(() => {
    const handler = () => {
      setStations([...state.stations])
      setDefaultId(state.defaultId)
    }
    global.state_event.on('apiStationsUpdated', handler)
    return () => {
      global.state_event.off('apiStationsUpdated', handler)
    }
  }, [])

  return { stations, defaultId }
}
