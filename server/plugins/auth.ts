import { initializeAuth } from '../core/auth'
export default defineNitroPlugin(()=>{if(!import.meta.prerender)initializeAuth()})
