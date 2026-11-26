import { authorize } from '../core/auth'
import { database } from '../core/db'
import { z } from 'zod'
export default defineEventHandler(e=>{authorize(e);const q=z.object({id:z.string().uuid(),from:z.coerce.number().int().nonnegative().default(0),to:z.coerce.number().int().positive().default(Date.now())}).parse(getQuery(e));return database().query<{at:number;body:string},[string,number,number]>('SELECT at,body FROM samples WHERE instance=? AND at BETWEEN ? AND ? ORDER BY at DESC LIMIT 2880').all(q.id,q.from,q.to).reverse().map(r=>({at:r.at,live:JSON.parse(r.body)}))})
