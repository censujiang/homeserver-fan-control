import { randomBytes, createHash } from 'node:crypto'
import { database, setting, setSetting, dataDir } from './db'
import { join } from 'node:path'
import { writeFileSync, readFileSync, unlinkSync } from 'node:fs'
import { createError, getHeader, type H3Event } from 'h3'
const sessions=new Map<string,number>()
const hash=(s:string)=>createHash('sha256').update(s).digest('hex')
export function setupRequired(){database();return !setting('admin')}
function setupToken(){
 const p=join(dataDir,'setup-token')
 try{writeFileSync(p,randomBytes(32).toString('hex'),{flag:'wx',mode:0o600})}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e}
 return readFileSync(p,'utf8').trim()
}
export function initializeAuth(){if(setupRequired())setupToken()}
export async function setup(token:string,password:string){
 if(!setupRequired()||hash(token)!==hash(setupToken()))throw createError({statusCode:403,statusMessage:'Setup denied'})
 const passwordHash=await Bun.password.hash(password)
 if(!setupRequired())throw createError({statusCode:409,statusMessage:'Already initialized'})
 setSetting('admin',passwordHash)
 unlinkSync(join(dataDir,'setup-token'))
}
let nextLogin=0
export async function login(password:string){
 if(Date.now()<nextLogin)throw createError({statusCode:429,statusMessage:'Try again later'})
 nextLogin=Date.now()+1000
 const saved=setting('admin')
 if(!saved||!await Bun.password.verify(password,saved))throw createError({statusCode:401,statusMessage:'Invalid credentials'})
 for(const [id,until] of sessions)if(until<Date.now())sessions.delete(id)
 if(sessions.size>=100)sessions.delete(sessions.keys().next().value!)
 const token=randomBytes(32).toString('hex');sessions.set(hash(token),Date.now()+8*3600000);return token
}
export function authorize(e:H3Event){
 const token=getHeader(e,'authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1]
 if(!token||(sessions.get(hash(token))??0)<Date.now())throw createError({statusCode:401,statusMessage:'Authentication required'})
}
export function logout(e:H3Event){authorize(e);sessions.delete(hash(getHeader(e,'authorization')!.slice(7)))}
