import { monitor } from '../core/runtime'
import { installed,externalPlugin } from '../core/external'
import { plugins } from '../core/registry'
import { setting } from '../core/db'
export default defineNitroPlugin(async nitro=>{
 if(import.meta.prerender)return
 if(process.env.HSFC_EXTERNAL_PLUGINS==='1'&&process.getuid?.()!==0)for(const m of await installed())if(setting('plugin:'+m.id)==='true')plugins.set(m.id,externalPlugin(m))
 monitor.start()
 nitro.hooks.hook('close',()=>monitor.stop())
})
