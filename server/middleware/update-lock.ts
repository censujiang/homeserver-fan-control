import {installing} from '../core/update'
export default defineEventHandler(e=>{
 if(installing()&&e.path.startsWith('/api/')&&!['GET','HEAD'].includes(e.method))throw createError({statusCode:503,statusMessage:'Update in progress'})
})
