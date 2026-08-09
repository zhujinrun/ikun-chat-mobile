import { Navigation } from 'react-native-navigation'
import Home from '@/screens/Home'
import Setting from '@/screens/Setting'
import { Provider } from '@/store/Provider'
import RootErrorBoundary from '@/components/common/RootErrorBoundary'
import { HOME_SCREEN, SETTING_SCREEN } from './screenNames'

function WrappedComponent(Component: any) {
  return function inject(props: Record<string, any>) {
    const EnhancedComponent = () => (
      <RootErrorBoundary>
        <Provider>
          <Component {...props} />
        </Provider>
      </RootErrorBoundary>
    )
    return <EnhancedComponent />
  }
}

export default () => {
  Navigation.registerComponent(HOME_SCREEN, () => WrappedComponent(Home))
  Navigation.registerComponent(SETTING_SCREEN, () => WrappedComponent(Setting))
  console.info('All screens have been registered...')
}
