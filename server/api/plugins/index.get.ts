import {authorize} from '../../core/auth'
import {installed} from '../../core/external'
export default defineEventHandler(async e=>{authorize(e);return installed()})
