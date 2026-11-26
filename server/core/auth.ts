import { randomBytes, createHash } from 'node:crypto'
import { database, setting, setSetting, dataDir } from './db'
import { join } from 'node:path'
import { unlinkSync } from 'node:fs'
import { createError, getHeader, getRequestIP, type H3Event } from 'h3'
const sessions=new Map<string,number>()
const hash=(s:string)=>createHash('sha256').update(s).digest('hex')
export function setupRequired(){database();return !setting('admin')}
export function initializeAuth(){database()}
function loopback(ip:string|undefined){return !!ip&&(/^(?:127\.\d+\.\d+\.\d+|::1|::ffff:127\.\d+\.\d+\.\d+)$/.test(ip))}
export function setupAllowed(e:H3Event){
 const host=getHeader(e,'host')??'',origin=getHeader(e,'origin')
 // No proxy-forwarded IP trust. Browser origins must match the request host.
 if(origin){try{const u=new URL(origin);if(u.host!==host||!['http:','https:'].includes(u.protocol))return false}catch{return false}}
 if(getHeader(e,'sec-fetch-site')==='cross-site')return false
 if(process.env.HSFC_ALLOW_REMOTE_SETUP==='1')return true
 const bind=process.env.NITRO_HOST??process.env.HOST??'127.0.0.1'
 const ip=getRequestIP(e,{xForwardedFor:false})
 // Bun/Nitro may not populate the peer IP. The explicit loopback listener
 // plus local Host and same-origin checks remain mandatory in that case.
 return loopback(bind)&&(!ip||loopback(ip))&&/^(?:localhost|127\.\d+\.\d+\.\d+|\[::1\])(?::\d+)?$/i.test(host)
}
let initializing=false
export async function setup(password:string){
 if(!setupRequired()||initializing)throw createError({statusCode:409,statusMessage:'Already initialized or setup in progress'})
 initializing=true
 try{
  const passwordHash=await Bun.password.hash(password)
  if(!setupRequired())throw createError({statusCode:409,statusMessage:'Already initialized'})
  setSetting('admin',passwordHash)
  // Clean up a legacy token only after committing the password.
  try{unlinkSync(join(dataDir,'setup-token'))}catch{/* absent or legacy file could not be removed; never used for authentication */}
 }finally{initializing=false}
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
