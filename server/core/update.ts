import { join } from 'node:path'
import { currentVersion, type Channel, type UpdateStatus } from '../../shared/release'
import { dataDir, event } from './db'
import { checkRelease, defaultChannel, deployment, downloadRelease } from './releases'
let state:UpdateStatus={current:currentVersion,deployment:deployment(),channel:defaultChannel,latest:null,checkedAt:null,state:'idle',downloaded:0,total:0}
let checking=false
export function updateStatus(){return {...state}}
export async function checkUpdate(channel:Channel){
 if(checking||state.state==='downloading')throw new Error('Update operation already running')
 if(state.channel===channel&&state.checkedAt&&Date.now()-state.checkedAt<60000)return updateStatus()
 checking=true
 try{
  const latest=await checkRelease(channel,deployment())
  state={current:currentVersion,deployment:deployment(),channel,latest,checkedAt:Date.now(),state:'idle',downloaded:0,total:latest?.size??0}
  return updateStatus()
 }finally{checking=false}
}
export function startDownload(tag:string){
 if(checking||state.state==='downloading'||!state.latest||state.latest.tag!==tag||!state.checkedAt||Date.now()-state.checkedAt>3600000)throw new Error('Check for updates first')
 if(process.platform!=='linux'||process.arch!=='x64'||deployment()==='source')throw new Error('Automatic asset download requires Linux x64 binary or Docker deployment')
 const release=state.latest
 state={...state,state:'downloading',downloaded:0,total:release.size,file:undefined,error:undefined}
 event('Update download started: '+release.tag)
 void downloadRelease(release,join(dataDir,'updates'),n=>{state.downloaded=n}).then(result=>{
  state={...state,state:'ready',file:result.file}
  event('Verified update downloaded: '+release.tag)
 }).catch(()=>{
  state={...state,state:'failed',error:'GitHub download or checksum verification failed'}
  event('Update download failed: '+release.tag)
 })
 return updateStatus()
}
