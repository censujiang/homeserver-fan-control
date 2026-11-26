import {z} from 'zod'
import {authorize} from '../../core/auth'
import {checkUpdate} from '../../core/update'
export default defineEventHandler(async e=>{
 authorize(e)
 const p=z.object({channel:z.enum(['stable','preview'])}).safeParse(await readBody(e))
 if(!p.success)throw createError({statusCode:400,statusMessage:'Invalid update channel'})
 try{return await checkUpdate(p.data.channel)}catch{throw createError({statusCode:503,statusMessage:'GitHub update check failed or busy'})}
})
