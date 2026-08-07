import { getThemeById } from '@/theme/themes'

interface InitState {
  theme: LX.ActiveTheme
}

const state: InitState = {
  theme: getThemeById('blue'),
}

export default state
