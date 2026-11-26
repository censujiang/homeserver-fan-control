import { access,lstat,writeFile,rename,rm } from 'node:fs/promises'
import { constants } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { dirname,join } from 'node:path'
import { currentVersion, type Channel, type UpdateStatus } from '../../shared/release'
import { dataDir, event, instances } from './db'
import { checkRelease, defaultChannel, deployment, downloadRelease } from './releases'
let state:UpdateStatus={current:currentVersion,deployment:deployment(),channel:defaultChannel,latest:null,checkedAt:null,state:'idle',downloaded:0,total:0}
let checking=false,verifiedHash:string|undefined
export function installing(){return state.state==='installing'}
export function automaticUpdate(){return deployment()==='binary'&&process.platform==='linux'&&process.arch==='x64'&&process.env.HSFC_SUPERVISOR_PID===String(process.ppid)&&!!process.env.HSFC_UPDATE_REQUEST}
export function updateStatus(){return {...state,canInstall:automaticUpdate()}}
export async function checkUpdate(channel:Channel){
 if(checking||(state.state==='downloading'||installing()))throw new Error('Update operation already running')
 if(state.channel===channel&&state.checkedAt&&Date.now()-state.checkedAt<60000)return updateStatus()
 checking=true
 try{
  const latest=await checkRelease(channel,deployment())
  state={current:currentVersion,deployment:deployment(),channel,latest,checkedAt:Date.now(),state:'idle',downloaded:0,total:latest?.size??0}
  return updateStatus()
 }finally{checking=false}
}
async function recordOutcome(tag:string,status:'pending'|'failed'){
 const p=join(dataDir,'update-result.json'),tmp=p+'.'+randomBytes(8).toString('hex')
 try{await writeFile(tmp,JSON.stringify({tag,status,at:Date.now()}),{flag:'wx',mode:0o600});await rename(tmp,p)}finally{await rm(tmp,{force:true})}
}
export async function startDownload(tag:string,autoInstall=false){
 if(checking||(state.state==='downloading'||installing())||!state.latest||state.latest.tag!==tag||!state.checkedAt||Date.now()-state.checkedAt>3600000)throw new Error('Check for updates first')
 if(process.platform!=='linux'||process.arch!=='x64'||deployment()==='source')throw new Error('Automatic asset download requires Linux x64 binary or Docker deployment')
 if(autoInstall&&(!automaticUpdate()||instances().some(i=>i.enabled&&i.mode==='ADAPTIVE'&&i.plugin!=='mock')))throw new Error('Stop physical adaptive control and ensure automatic update is available')
 const release=state.latest
 if(autoInstall)await recordOutcome(tag,'pending')
 state={...state,state:'downloading',downloaded:0,total:release.size,file:undefined,error:undefined}
 event('Update download started: '+release.tag)
 void downloadRelease(release,join(dataDir,'updates'),n=>{state.downloaded=n}).then(async result=>{
  verifiedHash=result.sha256
  state={...state,state:'ready',file:result.file}
  event('Verified update downloaded: '+release.tag)
  if(autoInstall)await startInstall(tag)
 }).catch(async()=>{
  state={...state,state:'failed',error:'GitHub download or checksum verification failed'}
  event('Update download or install failed: '+release.tag)
  if(autoInstall)await recordOutcome(tag,'failed').catch(()=>{})
 })
 return updateStatus()
}

export async function startInstall(tag:string){
 if(!automaticUpdate()||checking||state.state!=='ready'||!state.latest||state.latest.tag!==tag||!verifiedHash)throw new Error('Verified update not ready')
 if(instances().some(i=>i.enabled&&i.mode==='ADAPTIVE'&&i.plugin!=='mock'))throw new Error('Stop physical adaptive control before updating')
 const target=process.env.HSFC_UPDATE_REQUEST!,tmp=target+'.'+randomBytes(8).toString('hex')
 state={...state,state:'installing',error:undefined}
 try{
  const executable=await lstat(process.execPath)
  if(executable.uid!==process.getuid?.()||(executable.mode&0o022)!==0)throw new Error('Executable ownership prevents update')
  await access(dirname(process.execPath),constants.W_OK)
  await recordOutcome(tag,'pending')
  await writeFile(tmp,JSON.stringify({tag,size:state.latest!.size,sha256:verifiedHash}),{flag:'wx',mode:0o600})
  event('Installing verified update: '+tag)
  await rename(tmp,target)
  return updateStatus()
 }catch(e){state={...state,state:'ready',error:'Cannot install automatically; check executable directory permissions'};await recordOutcome(tag,'failed').catch(()=>{});throw e}
 finally{await rm(tmp,{force:true})}
}
