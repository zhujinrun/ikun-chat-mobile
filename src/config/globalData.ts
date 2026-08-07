import defaultSetting from './defaultSetting'
import { StateEvent } from '@/event/stateEvent'

global.lx = {
  setting: { ...defaultSetting },
  fontSize: 16,
  statusBarHeight: 0,
}

global.state_event = new StateEvent()
