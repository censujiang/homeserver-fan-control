import { setupRequired } from '../../core/auth'
export default defineEventHandler(()=>({setup:setupRequired()}))
