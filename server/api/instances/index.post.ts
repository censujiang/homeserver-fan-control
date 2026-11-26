import {installing} from '../../core/update'
import {controlIntent} from '../../core/control-intent'
import { authorize } from '../../core/auth'
import { instances, saveInstance, event } from '../../core/db'
import { plugins } from '../../core/registry'
import { monitor } from '../../core/runtime'
import { instanceSchema } from '../../../shared/model'
export default defineEventHandler(async e=>{
 authorize(e)
 const p=instanceSchema.safeParse(await readBody(e))
 if(!p.success)throw createError({statusCode:400,statusMessage:'Invalid instance configuration'})
 const b=controlIntent(p.data)
 if(b.mode==='ADAPTIVE'&&b.plugin!=='mock'&&!(b.plugin==='huawei.imana200'&&b.transport==='ssh'&&b.config.control==='experimental'))throw createError({statusCode:409,statusMessage:'Hardware write capability not validated'})
 const plugin=plugins.get(b.plugin)
 if(!plugin)throw createError({statusCode:400,statusMessage:'Unknown plugin'})
 try{const d=plugin.create(b.transport,b.config);await d.close()}catch{throw createError({statusCode:400,statusMessage:'Invalid driver configuration'})}
 if(instances().length>=32)throw createError({statusCode:409,statusMessage:'Instance limit reached'})
 if(installing())throw createError({statusCode:503,statusMessage:'Update in progress'})
 const i={...b,id:crypto.randomUUID()}
 saveInstance(i);monitor.add(i);event('Instance added',i.id);return {id:i.id}
})
