import {authorize} from '../../core/auth'
import {installed,externalPlugin} from '../../core/external'
import {instances,event,setSetting} from '../../core/db'
import {plugins} from '../../core/registry'
import {z} from 'zod'
export default defineEventHandler(async e=>{
 authorize(e);const id=getRouterParam(e,'id')!,{enabled}=z.object({enabled:z.boolean()}).parse(await readBody(e))
 const m=(await installed()).find(x=>x.id===id)
 if(!m)throw createError({statusCode:404})
 if(enabled){if(process.env.HSFC_EXTERNAL_PLUGINS!=='1'||process.getuid?.()===0)throw createError({statusCode:409,statusMessage:'Isolated runtime not enabled'});plugins.set(id,externalPlugin(m))}
 else {if(instances().some(i=>i.plugin===id))throw createError({statusCode:409,statusMessage:'Remove instances first'});plugins.delete(id)}
 setSetting('plugin:'+id,String(enabled));event('External plugin '+(enabled?'enabled: ':'disabled: ')+id);return {ok:true}
})
