import { z } from 'zod'
import { setup } from '../../core/auth'
export default defineEventHandler(async e=>{const b=z.object({token:z.string().length(64),password:z.string().min(12).max(128)}).parse(await readBody(e));await setup(b.token,b.password);return {ok:true}})
