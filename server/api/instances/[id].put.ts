import { authorize } from '../../core/auth'
import { instances, saveInstance, event } from '../../core/db'
import { plugins } from '../../core/registry'
import { monitor } from '../../core/runtime'
import { instanceSchema } from '../../../shared/model'
let busy=false
export default defineEventHandler(async e=>{
 authorize(e);if(busy)throw createError({statusCode:409,statusMessage:'Another update in progress'})
 busy=true
 try{
 const id=getRouterParam(e,'id')!,old=instances().find(i=>i.id===id)
 if(!old)throw createError({statusCode:404})
 const raw=await readBody(e)
 const p=instanceSchema.safeParse({...old,...raw,config:raw.config??old.config})
 if(!p.success)throw createError({statusCode:400,statusMessage:'Invalid configuration'})
 const b=p.data,plugin=plugins.get(b.plugin)
 if((b.mode==='ADAPTIVE'&&b.plugin!=='mock'&&!(b.plugin==='huawei.imana200'&&b.transport==='ssh'&&b.config.control==='experimental'))||!plugin)throw createError({statusCode:409,statusMessage:'Unsupported mode or plugin'})
 try{const d=plugin.create(b.transport,b.config);await d.close()}catch{throw createError({statusCode:400,statusMessage:'Invalid driver configuration'})}
 await monitor.remove(id)
 const i={...b,id};saveInstance(i);monitor.add(i);event('Instance updated',id);return {ok:true}
 }finally{busy=false}
})
