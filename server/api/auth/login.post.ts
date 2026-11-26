import { z } from 'zod'
import { login } from '../../core/auth'
const schema=z.object({password:z.string().min(1).max(128)})
export default defineEventHandler(async e=>{
 const b=schema.safeParse(await readBody(e))
 if(!b.success)throw createError({statusCode:400,statusMessage:'Invalid login input'})
 return {token:await login(b.data.password)}
})
