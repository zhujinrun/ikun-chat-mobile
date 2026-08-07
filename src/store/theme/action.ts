import { getThemeById } from '@/theme/themes'
import state from './state'

export default {
  applyTheme(id: string) {
    state.theme = getThemeById(id)
    global.state_event.themeUpdated(state.theme)
  },
}
