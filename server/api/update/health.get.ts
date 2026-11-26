import {setupRequired} from '../../core/auth'
import {currentVersion} from '../../../shared/release'
export default defineEventHandler(e=>{
 if(!process.env.HSFC_SUPERVISOR_TOKEN||getHeader(e,'x-hsfc-supervisor')!==process.env.HSFC_SUPERVISOR_TOKEN)throw createError({statusCode:404})
 return {version:currentVersion,setup:setupRequired()}
})
