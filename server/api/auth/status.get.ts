import { setupRequired, setupAllowed } from '../../core/auth'
export default defineEventHandler(e=>{const setup=setupRequired();return {setup,allowed:setup&&setupAllowed(e)}})
