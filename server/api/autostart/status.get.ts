import {authorize} from '../../core/auth'
import {autostartStatus} from '../../core/autostart'
export default defineEventHandler(async e=>{authorize(e);return autostartStatus()})
