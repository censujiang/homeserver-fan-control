import {authorize} from '../../core/auth'
import {installPlugin} from '../../core/external'
export default defineEventHandler(async e=>{
 authorize(e)
 const n=Number(getHeader(e,'content-length'))
 if(!Number.isFinite(n)||n<1||n>2*1024*1024)throw createError({statusCode:413,statusMessage:'ZIP must be at most 2 MiB with Content-Length'})
 const data=await readRawBody(e,false)
 if(!data||data.length!==n)throw createError({statusCode:400})
 try{return await installPlugin(data)}catch{throw createError({statusCode:400,statusMessage:'Invalid ZIP or existing plugin ID'})}
})
