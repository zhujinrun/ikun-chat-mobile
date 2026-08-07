import { Navigation } from 'react-native-navigation'
import * as screenNames from './screenNames'
import * as navigations from './navigation'
import registerScreens from './registerScreens'
import { onAppLaunched } from './regLaunchedEvent'

const init = (callback: () => void | Promise<void>) => {
  registerScreens()
  Navigation.setDefaultOptions({})
  onAppLaunched(() => {
    void callback()
  })
}

export { init, screenNames, navigations }
