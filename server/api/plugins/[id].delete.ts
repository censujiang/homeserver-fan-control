import {authorize} from '../../core/auth'
import {uninstall} from '../../core/external'
import {instances} from '../../core/db'
import {plugins} from '../../core/registry'
export default defineEventHandler(async e=>{
 authorize(e);const id=getRouterParam(e,'id')!
 if(instances().some(i=>i.plugin===id)||plugins.has(id))throw createError({statusCode:409,statusMessage:'Remove instances and disable plugin first'})
 try{await uninstall(id)}catch{throw createError({statusCode:400})}
 return {ok:true}
})
