import { z } from 'zod'
import { login } from '../../core/auth'
export default defineEventHandler(async e=>({token:await login(z.object({password:z.string().max(128)}).parse(await readBody(e)).password)}))
