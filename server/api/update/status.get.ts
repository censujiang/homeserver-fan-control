import {authorize} from '../../core/auth'
import {updateStatus} from '../../core/update'
export default defineEventHandler(e=>{authorize(e);return updateStatus()})
