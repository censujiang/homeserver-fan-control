import { z } from 'zod'
import { setup, setupAllowed } from '../../core/auth'
const schema=z.object({password:z.string().min(12).max(128)})
export default defineEventHandler(async e=>{
 if(!setupAllowed(e))throw createError({statusCode:403,statusMessage:'Setup requires local access or explicit remote setup opt-in'})
 if(!/^application\/json(?:\s*;|$)/i.test(getHeader(e,'content-type')??''))throw createError({statusCode:415,statusMessage:'JSON required'})
 const b=schema.safeParse(await readBody(e))
 if(!b.success)throw createError({statusCode:400,statusMessage:'Password must contain 12 to 128 characters'})
 await setup(b.data.password)
 return {ok:true}
})
