import { Navigation } from 'react-native-navigation'

let launched = false
const callbacks: Array<() => void> = []

export const listenLaunchEvent = () => {
  Navigation.events().registerAppLaunchedListener(() => {
    launched = true
    for (const cb of callbacks.splice(0)) cb()
  })
}

export const onAppLaunched = (cb: () => void) => {
  if (launched) {
    cb()
    return
  }
  callbacks.push(cb)
}
