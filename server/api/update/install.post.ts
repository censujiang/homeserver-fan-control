import {z} from 'zod'
import {authorize} from '../../core/auth'
import {startInstall} from '../../core/update'
export default defineEventHandler(async e=>{
 authorize(e)
 const p=z.object({tag:z.string().max(100)}).safeParse(await readBody(e))
 if(!p.success)throw createError({statusCode:400})
 try{return await startInstall(p.data.tag)}catch(err){throw createError({statusCode:409,statusMessage:(err as Error).message})}
})
