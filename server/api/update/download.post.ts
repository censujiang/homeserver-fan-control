import {z} from 'zod'
import {authorize} from '../../core/auth'
import {startDownload} from '../../core/update'
export default defineEventHandler(async e=>{
 authorize(e)
 const p=z.object({tag:z.string().max(100)}).safeParse(await readBody(e))
 if(!p.success)throw createError({statusCode:400})
 try{return startDownload(p.data.tag)}catch{throw createError({statusCode:409,statusMessage:'Download unavailable; check updates first'})}
})
