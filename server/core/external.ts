import yauzl from 'yauzl'
import { mkdir, mkdtemp, readFile, writeFile, rename, rm, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { dataDir, event } from './db'
import type { Manifest, Plugin, Driver, Sample } from '../../shared/model'
const field=z.object({key:z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/),label:z.string().max(100),type:z.enum(['text','number','password']),required:z.boolean().optional(),default:z.union([z.string(),z.number()]).optional()})
const schema=z.object({id:z.string().regex(/^[a-z0-9][a-z0-9.-]{1,63}$/).refine(s=>!s.includes('..')&&s!=='mock'&&s!=='huawei.imana200'),name:z.string().min(1).max(100),description:z.string().max(1000),version:z.string().regex(/^\d+\.\d+\.\d+$/),apiVersion:z.literal(1),author:z.string().max(100),entry:z.literal('index.mjs'),permissions:z.array(z.never()).max(0),minCoreVersion:z.literal('0.3.0'),modes:z.array(z.object({id:z.string().regex(/^[a-zA-Z0-9_-]{1,32}$/),label:z.string().max(100),fields:z.array(field).max(30)})).min(1).max(8)})
type Meta=z.infer<typeof schema>
const root=()=>join(dataDir,'plugins')
const idSchema=z.string().regex(/^[a-z0-9][a-z0-9.-]{1,63}$/).refine(s=>!s.includes('..')&&s!=='mock'&&s!=='huawei.imana200')
const allowed=new Set(['manifest.json','index.mjs','README.md','config.schema.json'])
const open=(data:Buffer)=>new Promise<yauzl.ZipFile>((res,rej)=>yauzl.fromBuffer(data,{lazyEntries:true,validateEntrySizes:true,strictFileNames:true},(e,z)=>e?rej(e):res(z)))
async function extract(data:Buffer,dir:string){
 const zip=await open(data)
 let count=0,total=0;const names=new Set<string>()
 try{await new Promise<void>((res,rej)=>{
  zip.on('error',rej);zip.on('end',res)
  zip.on('entry',(entry:yauzl.Entry)=>{
   const name=entry.fileName
   if(!allowed.has(name)||names.has(name)||++count>4||entry.uncompressedSize>2*1024*1024||total+entry.uncompressedSize>4*1024*1024||((entry.externalFileAttributes>>>16)&0o170000)===0o120000){rej(new Error('ZIP entry rejected'));return}
   names.add(name);total+=entry.uncompressedSize
   zip.openReadStream(entry,(err,stream)=>{
    if(err||!stream){rej(err??new Error('Invalid ZIP stream'));return}
    const chunks:Buffer[]=[];let size=0
    stream.on('error',rej)
    stream.on('data',(b:Buffer)=>{size+=b.length;if(size>entry.uncompressedSize||size>2*1024*1024){stream.destroy(new Error('ZIP limit exceeded'));return}chunks.push(b)})
    stream.on('end',()=>{writeFile(join(dir,name),Buffer.concat(chunks),{mode:0o600,flag:'wx'}).then(()=>zip.readEntry(),rej)})
   })
  });zip.readEntry()
 })}finally{zip.close()}
 if(!names.has('manifest.json')||!names.has('index.mjs'))throw new Error('Missing plugin manifest or entry')
}
export async function installPlugin(data:Buffer){
 if(data.length>2*1024*1024)throw new Error('ZIP too large')
 await mkdir(root(),{recursive:true,mode:0o700})
 const staging=await mkdtemp(join(root(),'.upload-'))
 try{
  await extract(data,staging)
  const manifest=schema.parse(JSON.parse(await readFile(join(staging,'manifest.json'),'utf8')))
  const entry=await readFile(join(staging,'index.mjs'))
  await writeFile(join(staging,'integrity.json'),JSON.stringify({entry:createHash('sha256').update(entry).digest('hex'),archive:createHash('sha256').update(data).digest('hex')}),{mode:0o600})
  // No overwrite: updates require removal of the old, inactive version first.
  const destination=join(root(),manifest.id)
  // Reserve ID atomically so even an empty existing directory cannot be overwritten.
  await mkdir(destination,{mode:0o700})
  try{await rename(staging,destination)}catch(e){await rm(destination,{recursive:true,force:true});throw e}
  event('External plugin installed (disabled): '+manifest.id)
  return manifest
 }finally{await rm(staging,{recursive:true,force:true})}
}
export async function installed(){
 await mkdir(root(),{recursive:true,mode:0o700})
 const out:Meta[]=[]
 for(const d of await readdir(root(),{withFileTypes:true}))if(d.isDirectory()&&idSchema.safeParse(d.name).success){
  try{const m=schema.parse(JSON.parse(await readFile(join(root(),d.name,'manifest.json'),'utf8')));if(m.id===d.name)out.push(m)}catch{/* invalid plugin quarantined */}
 }
 return out
}
export async function uninstall(id:string){idSchema.parse(id);await rm(join(root(),id),{recursive:true,force:true});event('External plugin removed: '+id)}
const sensor=z.object({id:z.string().min(1).max(128),name:z.string().max(128),kind:z.enum(['temperature','thermal-margin','power','rpm','percent','discrete']),value:z.number().finite().nullable(),unit:z.string().max(32),raw:z.string().max(512),valid:z.boolean(),health:z.enum(['ok','unknown','fault']),at:z.number().int()})
const sampleSchema=z.object({at:z.number().int(),identity:z.string().max(128).nullable(),health:z.enum(['ok','unknown','fault']),sensors:z.array(sensor).max(128),fanMode:z.string().max(64).optional(),fanLevel:z.number().min(0).max(100).optional()})
async function invoke(id:string,mode:string,config:Record<string,unknown>):Promise<Sample>{
 const dir=join(root(),id)
 const entry=await readFile(join(dir,'index.mjs'))
 const integrity=JSON.parse(await readFile(join(dir,'integrity.json'),'utf8'))
 if(createHash('sha256').update(entry).digest('hex')!==integrity.entry)throw new Error('Plugin integrity check failed')
 if(process.getuid?.()===0)throw new Error('External plugins refuse root execution')
 const exe=process.execPath
 // Explicit opt-in to a verified standalone binary. No development-runtime fallback.
 if(process.env.HSFC_EXTERNAL_PLUGINS!=='1'||!exe.startsWith('/'))throw new Error('External execution not enabled')
 const child=Bun.spawn(['/usr/bin/bwrap','--unshare-all','--die-with-parent','--new-session','--clearenv','--tmpfs','/','--ro-bind','/usr','/usr','--ro-bind-try','/lib','/lib','--ro-bind-try','/lib64','/lib64','--proc','/proc','--dev','/dev','--tmpfs','/tmp','--ro-bind',exe,'/hsfc','--ro-bind',dir,'/plugin','--chdir','/plugin','/hsfc','--plugin-worker'],{stdin:'pipe',stdout:'pipe',stderr:'ignore',env:{PATH:'/usr/bin:/bin'}})
 const timer=setTimeout(()=>child.kill(9),5000)
 try{
  child.stdin.write(JSON.stringify({mode,config}));await child.stdin.end()
  const reader=child.stdout.getReader();let output='',size=0;const decoder=new TextDecoder()
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>256*1024){child.kill(9);throw new Error('Plugin output limit exceeded')}output+=decoder.decode(value,{stream:true})}
  output+=decoder.decode()
  if(await child.exited!==0)throw new Error('Isolated plugin failed')
  return sampleSchema.parse(JSON.parse(output))
 }finally{clearTimeout(timer);child.kill()}
}
export function externalPlugin(m:Meta):Plugin{
 const manifest:Manifest=m
 return {manifest,create(mode,config):Driver{
  if(!m.modes.some(x=>x.id===mode))throw new Error('Unknown plugin mode')
  return {async connect(){},async identify(){return null},capabilities(){return {read:true,write:false,timedFallback:false,reason:'Isolated external plugin; simulation only'}},async sample(){const s=await invoke(m.id,mode,config);return {...s,identity:null,health:'unknown'}},async auto(){throw new Error('Read-only plugin')},async manual(){throw new Error('Read-only plugin')},async close(){}}
 }}
}
