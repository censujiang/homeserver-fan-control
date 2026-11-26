import { authorize } from '../../core/auth'
import { removeInstance,event } from '../../core/db'
import { monitor } from '../../core/runtime'
export default defineEventHandler(async e=>{authorize(e);const id=getRouterParam(e,'id')!;await monitor.remove(id);removeInstance(id);event('Instance removed',id);return {ok:true}})
