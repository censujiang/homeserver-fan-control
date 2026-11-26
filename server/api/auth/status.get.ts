import { setupRequired, setupAllowed } from '../../core/auth'
import { currentVersion } from '../../../shared/release'
import {dataDir} from '../../core/db'
import {readFileSync} from 'node:fs'
import {join} from 'node:path'
export default defineEventHandler(e=>{
 const setup=setupRequired()
 let updateResult:{tag:string;status:string}|undefined
 try{const x=JSON.parse(readFileSync(join(dataDir,'update-result.json'),'utf8'));if(typeof x.tag==='string'&&['pending','success','failed','rolled-back'].includes(x.status))updateResult={tag:x.tag,status:x.status}}catch{/* no prior update */}
 return {setup,allowed:setup&&setupAllowed(e),version:currentVersion,updateResult}
})
