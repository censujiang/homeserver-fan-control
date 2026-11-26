import { authorize } from '../core/auth'
import { database, instances } from '../core/db'
import { plugins } from '../core/registry'
import { monitor } from '../core/runtime'
export default defineEventHandler(e=>{authorize(e);return {plugins:[...plugins.values()].map(p=>p.manifest),instances:instances().map(({config,...i})=>({...i,configuredFields:Object.keys(config),live:monitor.get(i.id)})),events:database().query('SELECT * FROM events ORDER BY id DESC LIMIT 50').all()}})
