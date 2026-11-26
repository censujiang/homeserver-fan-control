import { test,expect } from 'bun:test'
import { mkdtempSync,rmSync } from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
test('database initialization and encrypted persistence',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'hsfc-'))
 process.env.HSFC_DATA_DIR=dir
 const db=await import('../server/core/db')
 const {defaultPolicy}=await import('../shared/model')
 db.saveInstance({id:'test',name:'test',mode:'MONITOR',enabled:false,plugin:'mock',transport:'mock',config:{password:'secret-example'},policy:defaultPolicy})
 expect(db.instances()[0]?.config.password).toBe('secret-example')
 expect(JSON.stringify(db.database().query('SELECT body FROM instances').all())).not.toContain('secret-example')
 db.database().close();rmSync(dir,{recursive:true,force:true})
})
