import {authorize} from '../../core/auth'
import {enableAutostart} from '../../core/autostart'
import {event} from '../../core/db'
export default defineEventHandler(async e=>{
 authorize(e)
 try{const s=await enableAutostart();event('Autostart setup: '+s.state+' ('+s.reason+')');return s}
 catch{throw createError({statusCode:409,statusMessage:'Autostart setup failed; use host commands'})}
})
