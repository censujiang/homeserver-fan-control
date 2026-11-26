import { logout } from '../../core/auth'
export default defineEventHandler(e=>{logout(e);return {ok:true}})
