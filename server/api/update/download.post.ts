import {z} from 'zod'
import {authorize} from '../../core/auth'
import {startDownload} from '../../core/update'
export default defineEventHandler(async e=>{
 authorize(e)
 const p=z.object({tag:z.string().max(100),autoInstall:z.boolean().optional()}).safeParse(await readBody(e))
 if(!p.success)throw createError({statusCode:400})
 try{return await startDownload(p.data.tag,p.data.autoInstall??false)}catch(e){throw createError({statusCode:409,statusMessage:(e as Error).message})}
})
