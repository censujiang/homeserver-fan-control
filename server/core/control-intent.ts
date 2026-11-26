import type {Instance} from '../../shared/model'
type Input=Omit<Instance,'id'>
export function controlIntent(b:Input):Input{
 // The operating mode is the explicit opt-in. Preserve the old driver
 // config key internally for compatibility, but do not ask twice in the UI.
 if(b.plugin==='huawei.imana200'&&b.transport==='ssh')return {...b,config:{...b.config,control:b.mode==='ADAPTIVE'?'experimental':'monitor'}}
 return b
}
