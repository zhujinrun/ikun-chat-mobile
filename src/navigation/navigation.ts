import {
  CommonActions,
  StackActions,
  createNavigationContainerRef,
} from '@react-navigation/native'
import { HOME_SCREEN, SETTING_SCREEN } from './screenNames'
import type { RootStackParamList } from './types'

export const navigationRef = createNavigationContainerRef<RootStackParamList>()

export async function pushHomeScreen() {
  if (!navigationRef.isReady()) return

  navigationRef.dispatch(
    CommonActions.reset({
      index: 0,
      routes: [{ name: HOME_SCREEN }],
    })
  )
}

export async function repairHomeScreenAfterResume() {
  if (!navigationRef.isReady()) return
  const currentRoute = navigationRef.getCurrentRoute()?.name
  if (currentRoute && currentRoute !== HOME_SCREEN) return

  await pushHomeScreen()
}

export async function pushSettingScreen() {
  if (!navigationRef.isReady()) return
  if (navigationRef.getCurrentRoute()?.name === SETTING_SCREEN) return
  navigationRef.dispatch(StackActions.push(SETTING_SCREEN))
}
