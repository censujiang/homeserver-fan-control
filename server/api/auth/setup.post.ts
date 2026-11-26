import { z } from 'zod'
import { setup } from '../../core/auth'
const schema=z.object({token:z.string().trim().regex(/^[0-9a-f]{64}$/),password:z.string().min(12).max(128)})
export default defineEventHandler(async e=>{
 const b=schema.safeParse(await readBody(e))
 if(!b.success)throw createError({statusCode:400,statusMessage:'Invalid setup input',data:{field:b.error.issues[0]?.path[0]}})
 await setup(b.data.token,b.data.password)
 return {ok:true}
})
