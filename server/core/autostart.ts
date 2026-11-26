import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile, lstat, realpath } from 'node:fs/promises'
import { homedir } from 'node:os'
import { resolve, join, isAbsolute } from 'node:path'
import type { AutostartStatus } from '../../shared/autostart'
type Launch={exe:string;args:string[];cwd:string;data:string}
export function shellQuote(s:string){return "'"+s.replaceAll("'","'\\''")+"'"}
function unitQuote(s:string,exec=false){
 if(!s||/[\x00-\x1f\x7f]/.test(s))throw new Error('Unsupported systemd argument')
 return '"'+s.replaceAll('\\','\\\\').replaceAll('"','\\"').replaceAll('%','%%').replaceAll('+'"'
}
// systemd requires $$ to escape a literal dollar in ExecStart.
export function renderUnit(l:Launch){
 return ['[Unit]','Description=HomeServer Fan Control (user service)','[Service]','Type=simple','WorkingDirectory='+unitQuote(l.cwd),'ExecStart='+[l.exe,...l.args].map(s=>unitQuote(s,true)).join(' '),'Restart=on-failure','TimeoutStopSec=90','NoNewPrivileges=true','UMask=0077','[Install]','WantedBy=default.target',''].join('\n')
}
export function unitName(data:string){return 'homeserver-fan-control-'+createHash('sha256').update(data).digest('hex').slice(0,12)+'.service'}
export function persistentState(s:string,linger?:boolean):AutostartStatus['state']{
 if(s==='enabled')return linger===undefined?'enabled':linger?'enabled':'disabled'
 if(['disabled','enabled-runtime','masked','masked-runtime','not-found'].includes(s))return 'disabled'
 return 'unknown'
}
const uid=()=>process.getuid?.()
const systemctl='/usr/bin/systemctl',loginctl='/usr/bin/loginctl'
async function run(exe:string,args:string[]){
 if(!existsSync(exe))return {code:127,out:''}
 try{
  const p=Bun.spawn([exe,...args],{stdin:'ignore',stdout:'pipe',stderr:'ignore',env:{...process.env,LC_ALL:'C',SYSTEMD_PAGER:'cat',SYSTEMD_COLORS:'0'}})
  const timer=setTimeout(()=>p.kill(9),3500)
  try{const [code,out]=await Promise.all([p.exited,new Response(p.stdout).text()]);return {code,out:out.trim()}}
  finally{clearTimeout(timer)}
 }catch{return {code:127,out:''}}
}
function result(state:AutostartStatus['state'],manager:AutostartStatus['manager'],reason:string,extra:Partial<AutostartStatus>={}):AutostartStatus{return {state,manager,reason,canEnable:false,commands:[],...extra}}
async function launch():Promise<Launch|null>{
 const mode=process.env.HSFC_DEPLOYMENT
 if(mode!=='binary'&&mode!=='source')return null
 const exe=await realpath(process.execPath),cwd=process.cwd(),data=resolve(process.env.HSFC_DATA_DIR??'./data')
 const args:string[]=[]
 if(mode==='source'){
  const entry=process.env.HSFC_STARTUP_ENTRY
  if(!entry||!isAbsolute(entry)||!entry.endsWith('/scripts/entry.ts')||!existsSync(entry))return null
  args.push(entry)
 }
 const host=process.env.NITRO_HOST??process.env.HOST??'127.0.0.1',port=process.env.NITRO_PORT??process.env.PORT??'3000'
 if(!/^\d+$/.test(port)||Number(port)<1||Number(port)>65535)return null
 args.push('--host',host,'--port',port,'--data-dir',data)
 return {exe,args,cwd,data}
}
async function lingerState(){
 const u=uid();if(u===undefined)return undefined
 const r=await run(loginctl,['show-user',String(u),'--property=Linger','--value'])
 return r.code===0?(r.out==='yes'?true:r.out==='no'?false:undefined):undefined
}
async function currentService(){
 const c=await readFile('/proc/self/cgroup','utf8').catch(()=> '')
 for(const line of c.split('\n')){
  const names=line.split('/'),unit=names.at(-1)
  if(!unit||!(/^[a-zA-Z0-9_.@-]+\.service$/).test(unit)||unit.startsWith('user@'))continue
  const user=names.some(x=>/^user@\d+\.service$/.test(x))
  const flags=user?['--user']:[]
  const p=await run(systemctl,[...flags,'show',unit,'--property=MainPID','--value'])
  if(p.code===0&&Number(p.out)===process.pid)return {unit,user,flags}
 }
 return null
}
const dockerCommands=['docker inspect --format \'{{.HostConfig.RestartPolicy.Name}}\' <container>','docker update --restart unless-stopped <container>','sudo systemctl enable docker']
function userPath(name:string){const x=process.env.XDG_CONFIG_HOME;return join(x&&isAbsolute(x)?x:join(homedir(),'.config'),'systemd','user',name)}
async function ownedUnit(file:string,expected:string){
 try{const s=await lstat(file);return s.isFile()&&!s.isSymbolicLink()&&(await readFile(file,'utf8'))===expected?'match':'conflict'}
 catch(e){return (e as NodeJS.ErrnoException).code==='ENOENT'?'missing':'conflict'}
}
function userCommands(l:Launch){
 const cli=[l.exe,...l.args].map(shellQuote)
 // Insert CLI action before options, after script path for source mode.
 cli.splice(process.env.HSFC_DEPLOYMENT==='source'?2:1,0,'--enable-autostart')
 return ['sudo loginctl enable-linger '+String(uid()),'cd '+shellQuote(l.cwd)+' && '+cli.join(' ')]
}
export async function autostartStatus():Promise<AutostartStatus>{
 if(process.env.HSFC_DEPLOYMENT==='docker'||existsSync('/.dockerenv')||existsSync('/run/.containerenv'))return result('unknown','docker','docker_host_required',{commands:dockerCommands})
 if(process.platform!=='linux'||!existsSync('/run/systemd/system')||!existsSync(systemctl))return result('unknown','none','systemd_unavailable')
 const current=await currentService()
 if(current){
  const enabled=await run(systemctl,[...current.flags,'is-enabled',current.unit])
  const linger=current.user?await lingerState():undefined
  const state=current.user&&linger===undefined&&enabled.out==='enabled'?'unknown':persistentState(enabled.out,linger)
  return result(state,current.user?'systemd-user':'systemd-system',state==='enabled'?'managed_enabled':'managed_not_confirmed',{unit:current.unit,active:true,linger,canEnable:current.user&&uid()!==0&&state!=='enabled'&&!enabled.out.startsWith('masked'),commands:current.user?['systemctl --user enable '+shellQuote(current.unit),'sudo loginctl enable-linger '+String(uid())]:['sudo systemctl enable '+shellQuote(current.unit)]})
 }
 const l=await launch().catch(()=>null)
 if(!l)return result('unknown','none','launch_unknown')
 if(uid()===0)return result('unknown','systemd-system','root_manual_required',{commands:['sudo systemctl edit --force --full homeserver-fan-control.service','sudo systemctl enable homeserver-fan-control.service']})
 const name=unitName(l.data),file=userPath(name),expected=renderUnit(l)
 const found=await ownedUnit(file,expected)
 const manager=await run(systemctl,['--user','show','--property=Version','--value'])
 if(found==='conflict')return result('unknown','systemd-user','unit_conflict',{unit:name,commands:['systemctl --user cat '+shellQuote(name)]})
 if(manager.code!==0)return result('unknown','systemd-user','user_manager_unavailable',{unit:name,commands:userCommands(l)})
 const enabled=await run(systemctl,['--user','is-enabled',name]),linger=await lingerState()
 // Never modify a same-named unit provided by another location.
 if(found==='missing'&&enabled.out&&!['not-found','disabled'].includes(enabled.out))return result('unknown','systemd-user','unit_conflict',{unit:name,commands:['systemctl --user cat '+shellQuote(name)]})
 const state=found==='missing'?'disabled':linger===undefined&&enabled.out==='enabled'?'unknown':persistentState(enabled.out,linger)
 return result(state,'systemd-user',state==='enabled'?'enabled_next_boot':found==='missing'?'not_detected':'user_linger_or_enable_required',{unit:name,active:false,linger,canEnable:state!=='enabled'&&!enabled.out.startsWith('masked'),commands:userCommands(l)})
}
let enabling=false
export async function enableAutostart():Promise<AutostartStatus>{
 if(enabling)throw new Error('Autostart setup already running')
 enabling=true
 try{
  const s=await autostartStatus()
  if(!s.canEnable)return s
  if(s.manager!=='systemd-user'||uid()===0||!s.unit)return s
  const current=await currentService()
  if(!current){
   const l=await launch();if(!l||s.unit!==unitName(l.data))throw new Error('Launch changed')
   const file=userPath(s.unit),expected=renderUnit(l)
   await mkdir(resolve(file,'..'),{recursive:true,mode:0o700})
   const f=await ownedUnit(file,expected)
   if(f==='missing')await writeFile(file,expected,{flag:'wx',mode:0o600})
   else if(f!=='match')throw new Error('Existing unit differs')
   if((await run(systemctl,['--user','daemon-reload'])).code!==0)return {...s,reason:'enable_failed'}
  }else if(!current.user||current.unit!==s.unit)throw new Error('Service changed')
  if((await run(systemctl,['--user','--no-ask-password','enable',s.unit])).code!==0)return {...s,reason:'enable_failed'}
  if(await lingerState()!==true)await run(loginctl,['--no-ask-password','enable-linger',String(uid())])
  const after=await autostartStatus()
  return after.state==='enabled'?after:{...after,reason:'linger_or_permission_required'}
 }finally{enabling=false}
}
,()=>exec?'$':'+'"'
}
// systemd requires $$ to escape a literal dollar in ExecStart.
export function renderUnit(l:Launch){
 return ['[Unit]','Description=HomeServer Fan Control (user service)','[Service]','Type=simple','WorkingDirectory='+unitQuote(l.cwd),'ExecStart='+[l.exe,...l.args].map(s=>unitQuote(s,true)).join(' '),'Restart=on-failure','TimeoutStopSec=90','NoNewPrivileges=true','UMask=0077','[Install]','WantedBy=default.target',''].join('\n')
}
export function unitName(data:string){return 'homeserver-fan-control-'+createHash('sha256').update(data).digest('hex').slice(0,12)+'.service'}
export function persistentState(s:string,linger?:boolean):AutostartStatus['state']{
 if(s==='enabled')return linger===undefined?'enabled':linger?'enabled':'disabled'
 if(['disabled','enabled-runtime','masked','masked-runtime','not-found'].includes(s))return 'disabled'
 return 'unknown'
}
const uid=()=>process.getuid?.()
const systemctl='/usr/bin/systemctl',loginctl='/usr/bin/loginctl'
async function run(exe:string,args:string[]){
 if(!existsSync(exe))return {code:127,out:''}
 try{
  const p=Bun.spawn([exe,...args],{stdin:'ignore',stdout:'pipe',stderr:'ignore',env:{...process.env,LC_ALL:'C',SYSTEMD_PAGER:'cat',SYSTEMD_COLORS:'0'}})
  const timer=setTimeout(()=>p.kill(9),3500)
  try{const [code,out]=await Promise.all([p.exited,new Response(p.stdout).text()]);return {code,out:out.trim()}}
  finally{clearTimeout(timer)}
 }catch{return {code:127,out:''}}
}
function result(state:AutostartStatus['state'],manager:AutostartStatus['manager'],reason:string,extra:Partial<AutostartStatus>={}):AutostartStatus{return {state,manager,reason,canEnable:false,commands:[],...extra}}
async function launch():Promise<Launch|null>{
 const mode=process.env.HSFC_DEPLOYMENT
 if(mode!=='binary'&&mode!=='source')return null
 const exe=await realpath(process.execPath),cwd=process.cwd(),data=resolve(process.env.HSFC_DATA_DIR??'./data')
 const args:string[]=[]
 if(mode==='source'){
  const entry=process.env.HSFC_STARTUP_ENTRY
  if(!entry||!isAbsolute(entry)||!entry.endsWith('/scripts/entry.ts')||!existsSync(entry))return null
  args.push(entry)
 }
 const host=process.env.NITRO_HOST??process.env.HOST??'127.0.0.1',port=process.env.NITRO_PORT??process.env.PORT??'3000'
 if(!/^\d+$/.test(port)||Number(port)<1||Number(port)>65535)return null
 args.push('--host',host,'--port',port,'--data-dir',data)
 return {exe,args,cwd,data}
}
async function lingerState(){
 const u=uid();if(u===undefined)return undefined
 const r=await run(loginctl,['show-user',String(u),'--property=Linger','--value'])
 return r.code===0?(r.out==='yes'?true:r.out==='no'?false:undefined):undefined
}
async function currentService(){
 const c=await readFile('/proc/self/cgroup','utf8').catch(()=> '')
 for(const line of c.split('\n')){
  const names=line.split('/'),unit=names.at(-1)
  if(!unit||!(/^[a-zA-Z0-9_.@-]+\.service$/).test(unit)||unit.startsWith('user@'))continue
  const user=names.some(x=>/^user@\d+\.service$/.test(x))
  const flags=user?['--user']:[]
  const p=await run(systemctl,[...flags,'show',unit,'--property=MainPID','--value'])
  if(p.code===0&&Number(p.out)===process.pid)return {unit,user,flags}
 }
 return null
}
const dockerCommands=['docker inspect --format \'{{.HostConfig.RestartPolicy.Name}}\' <container>','docker update --restart unless-stopped <container>','sudo systemctl enable docker']
function userPath(name:string){const x=process.env.XDG_CONFIG_HOME;return join(x&&isAbsolute(x)?x:join(homedir(),'.config'),'systemd','user',name)}
async function ownedUnit(file:string,expected:string){
 try{const s=await lstat(file);return s.isFile()&&!s.isSymbolicLink()&&(await readFile(file,'utf8'))===expected?'match':'conflict'}
 catch(e){return (e as NodeJS.ErrnoException).code==='ENOENT'?'missing':'conflict'}
}
function userCommands(l:Launch){
 const cli=[l.exe,...l.args].map(shellQuote)
 // Insert CLI action before options, after script path for source mode.
 cli.splice(process.env.HSFC_DEPLOYMENT==='source'?2:1,0,'--enable-autostart')
 return ['sudo loginctl enable-linger '+String(uid()),'cd '+shellQuote(l.cwd)+' && '+cli.join(' ')]
}
export async function autostartStatus():Promise<AutostartStatus>{
 if(process.env.HSFC_DEPLOYMENT==='docker'||existsSync('/.dockerenv')||existsSync('/run/.containerenv'))return result('unknown','docker','docker_host_required',{commands:dockerCommands})
 if(process.platform!=='linux'||!existsSync('/run/systemd/system')||!existsSync(systemctl))return result('unknown','none','systemd_unavailable')
 const current=await currentService()
 if(current){
  const enabled=await run(systemctl,[...current.flags,'is-enabled',current.unit])
  const linger=current.user?await lingerState():undefined
  const state=current.user&&linger===undefined&&enabled.out==='enabled'?'unknown':persistentState(enabled.out,linger)
  return result(state,current.user?'systemd-user':'systemd-system',state==='enabled'?'managed_enabled':'managed_not_confirmed',{unit:current.unit,active:true,linger,canEnable:current.user&&uid()!==0&&state!=='enabled'&&!enabled.out.startsWith('masked'),commands:current.user?['systemctl --user enable '+shellQuote(current.unit),'sudo loginctl enable-linger '+String(uid())]:['sudo systemctl enable '+shellQuote(current.unit)]})
 }
 const l=await launch().catch(()=>null)
 if(!l)return result('unknown','none','launch_unknown')
 if(uid()===0)return result('unknown','systemd-system','root_manual_required',{commands:['sudo systemctl edit --force --full homeserver-fan-control.service','sudo systemctl enable homeserver-fan-control.service']})
 const name=unitName(l.data),file=userPath(name),expected=renderUnit(l)
 const found=await ownedUnit(file,expected)
 const manager=await run(systemctl,['--user','show-environment'])
 if(found==='conflict')return result('unknown','systemd-user','unit_conflict',{unit:name,commands:['systemctl --user cat '+shellQuote(name)]})
 if(manager.code!==0)return result('unknown','systemd-user','user_manager_unavailable',{unit:name,commands:userCommands(l)})
 const enabled=await run(systemctl,['--user','is-enabled',name]),linger=await lingerState()
 // Never modify a same-named unit provided by another location.
 if(found==='missing'&&enabled.out&&!['not-found','disabled'].includes(enabled.out))return result('unknown','systemd-user','unit_conflict',{unit:name,commands:['systemctl --user cat '+shellQuote(name)]})
 const state=found==='missing'?'disabled':linger===undefined&&enabled.out==='enabled'?'unknown':persistentState(enabled.out,linger)
 return result(state,'systemd-user',state==='enabled'?'enabled_next_boot':found==='missing'?'not_detected':'user_linger_or_enable_required',{unit:name,active:false,linger,canEnable:state!=='enabled'&&!enabled.out.startsWith('masked'),commands:userCommands(l)})
}
let enabling=false
export async function enableAutostart():Promise<AutostartStatus>{
 if(enabling)throw new Error('Autostart setup already running')
 enabling=true
 try{
  const s=await autostartStatus()
  if(!s.canEnable)return s
  if(s.manager!=='systemd-user'||uid()===0||!s.unit)return s
  const current=await currentService()
  if(!current){
   const l=await launch();if(!l||s.unit!==unitName(l.data))throw new Error('Launch changed')
   const file=userPath(s.unit),expected=renderUnit(l)
   await mkdir(resolve(file,'..'),{recursive:true,mode:0o700})
   const f=await ownedUnit(file,expected)
   if(f==='missing')await writeFile(file,expected,{flag:'wx',mode:0o600})
   else if(f!=='match')throw new Error('Existing unit differs')
   if((await run(systemctl,['--user','daemon-reload'])).code!==0)return {...s,reason:'enable_failed'}
  }else if(!current.user||current.unit!==s.unit)throw new Error('Service changed')
  if((await run(systemctl,['--user','--no-ask-password','enable',s.unit])).code!==0)return {...s,reason:'enable_failed'}
  if(await lingerState()!==true)await run(loginctl,['--no-ask-password','enable-linger',String(uid())])
  const after=await autostartStatus()
  return after.state==='enabled'?after:{...after,reason:'linger_or_permission_required'}
 }finally{enabling=false}
}
)+'"'
}
// systemd requires $$ to escape a literal dollar in ExecStart.
export function renderUnit(l:Launch){
 return ['[Unit]','Description=HomeServer Fan Control (user service)','[Service]','Type=simple','WorkingDirectory='+unitQuote(l.cwd),'ExecStart='+[l.exe,...l.args].map(s=>unitQuote(s,true)).join(' '),'Restart=on-failure','TimeoutStopSec=90','NoNewPrivileges=true','UMask=0077','[Install]','WantedBy=default.target',''].join('\n')
}
export function unitName(data:string){return 'homeserver-fan-control-'+createHash('sha256').update(data).digest('hex').slice(0,12)+'.service'}
export function persistentState(s:string,linger?:boolean):AutostartStatus['state']{
 if(s==='enabled')return linger===undefined?'enabled':linger?'enabled':'disabled'
 if(['disabled','enabled-runtime','masked','masked-runtime','not-found'].includes(s))return 'disabled'
 return 'unknown'
}
const uid=()=>process.getuid?.()
const systemctl='/usr/bin/systemctl',loginctl='/usr/bin/loginctl'
async function run(exe:string,args:string[]){
 if(!existsSync(exe))return {code:127,out:''}
 try{
  const p=Bun.spawn([exe,...args],{stdin:'ignore',stdout:'pipe',stderr:'ignore',env:{...process.env,LC_ALL:'C',SYSTEMD_PAGER:'cat',SYSTEMD_COLORS:'0'}})
  const timer=setTimeout(()=>p.kill(9),3500)
  try{const [code,out]=await Promise.all([p.exited,new Response(p.stdout).text()]);return {code,out:out.trim()}}
  finally{clearTimeout(timer)}
 }catch{return {code:127,out:''}}
}
function result(state:AutostartStatus['state'],manager:AutostartStatus['manager'],reason:string,extra:Partial<AutostartStatus>={}):AutostartStatus{return {state,manager,reason,canEnable:false,commands:[],...extra}}
async function launch():Promise<Launch|null>{
 const mode=process.env.HSFC_DEPLOYMENT
 if(mode!=='binary'&&mode!=='source')return null
 const exe=await realpath(process.execPath),cwd=process.cwd(),data=resolve(process.env.HSFC_DATA_DIR??'./data')
 const args:string[]=[]
 if(mode==='source'){
  const entry=process.env.HSFC_STARTUP_ENTRY
  if(!entry||!isAbsolute(entry)||!entry.endsWith('/scripts/entry.ts')||!existsSync(entry))return null
  args.push(entry)
 }
 const host=process.env.NITRO_HOST??process.env.HOST??'127.0.0.1',port=process.env.NITRO_PORT??process.env.PORT??'3000'
 if(!/^\d+$/.test(port)||Number(port)<1||Number(port)>65535)return null
 args.push('--host',host,'--port',port,'--data-dir',data)
 return {exe,args,cwd,data}
}
async function lingerState(){
 const u=uid();if(u===undefined)return undefined
 const r=await run(loginctl,['show-user',String(u),'--property=Linger','--value'])
 return r.code===0?(r.out==='yes'?true:r.out==='no'?false:undefined):undefined
}
async function currentService(){
 const c=await readFile('/proc/self/cgroup','utf8').catch(()=> '')
 for(const line of c.split('\n')){
  const names=line.split('/'),unit=names.at(-1)
  if(!unit||!(/^[a-zA-Z0-9_.@-]+\.service$/).test(unit)||unit.startsWith('user@'))continue
  const user=names.some(x=>/^user@\d+\.service$/.test(x))
  const flags=user?['--user']:[]
  const p=await run(systemctl,[...flags,'show',unit,'--property=MainPID','--value'])
  if(p.code===0&&Number(p.out)===process.pid)return {unit,user,flags}
 }
 return null
}
const dockerCommands=['docker inspect --format \'{{.HostConfig.RestartPolicy.Name}}\' <container>','docker update --restart unless-stopped <container>','sudo systemctl enable docker']
function userPath(name:string){const x=process.env.XDG_CONFIG_HOME;return join(x&&isAbsolute(x)?x:join(homedir(),'.config'),'systemd','user',name)}
async function ownedUnit(file:string,expected:string){
 try{const s=await lstat(file);return s.isFile()&&!s.isSymbolicLink()&&(await readFile(file,'utf8'))===expected?'match':'conflict'}
 catch(e){return (e as NodeJS.ErrnoException).code==='ENOENT'?'missing':'conflict'}
}
function userCommands(l:Launch){
 const cli=[l.exe,...l.args].map(shellQuote)
 // Insert CLI action before options, after script path for source mode.
 cli.splice(process.env.HSFC_DEPLOYMENT==='source'?2:1,0,'--enable-autostart')
 return ['sudo loginctl enable-linger '+String(uid()),'cd '+shellQuote(l.cwd)+' && '+cli.join(' ')]
}
export async function autostartStatus():Promise<AutostartStatus>{
 if(process.env.HSFC_DEPLOYMENT==='docker'||existsSync('/.dockerenv')||existsSync('/run/.containerenv'))return result('unknown','docker','docker_host_required',{commands:dockerCommands})
 if(process.platform!=='linux'||!existsSync('/run/systemd/system')||!existsSync(systemctl))return result('unknown','none','systemd_unavailable')
 const current=await currentService()
 if(current){
  const enabled=await run(systemctl,[...current.flags,'is-enabled',current.unit])
  const linger=current.user?await lingerState():undefined
  const state=current.user&&linger===undefined&&enabled.out==='enabled'?'unknown':persistentState(enabled.out,linger)
  return result(state,current.user?'systemd-user':'systemd-system',state==='enabled'?'managed_enabled':'managed_not_confirmed',{unit:current.unit,active:true,linger,canEnable:current.user&&uid()!==0&&state!=='enabled'&&!enabled.out.startsWith('masked'),commands:current.user?['systemctl --user enable '+shellQuote(current.unit),'sudo loginctl enable-linger '+String(uid())]:['sudo systemctl enable '+shellQuote(current.unit)]})
 }
 const l=await launch().catch(()=>null)
 if(!l)return result('unknown','none','launch_unknown')
 if(uid()===0)return result('unknown','systemd-system','root_manual_required',{commands:['sudo systemctl edit --force --full homeserver-fan-control.service','sudo systemctl enable homeserver-fan-control.service']})
 const name=unitName(l.data),file=userPath(name),expected=renderUnit(l)
 const found=await ownedUnit(file,expected)
 const manager=await run(systemctl,['--user','show-environment'])
 if(found==='conflict')return result('unknown','systemd-user','unit_conflict',{unit:name,commands:['systemctl --user cat '+shellQuote(name)]})
 if(manager.code!==0)return result('unknown','systemd-user','user_manager_unavailable',{unit:name,commands:userCommands(l)})
 const enabled=await run(systemctl,['--user','is-enabled',name]),linger=await lingerState()
 // Never modify a same-named unit provided by another location.
 if(found==='missing'&&enabled.out&&!['not-found','disabled'].includes(enabled.out))return result('unknown','systemd-user','unit_conflict',{unit:name,commands:['systemctl --user cat '+shellQuote(name)]})
 const state=found==='missing'?'disabled':linger===undefined&&enabled.out==='enabled'?'unknown':persistentState(enabled.out,linger)
 return result(state,'systemd-user',state==='enabled'?'enabled_next_boot':found==='missing'?'not_detected':'user_linger_or_enable_required',{unit:name,active:false,linger,canEnable:state!=='enabled'&&!enabled.out.startsWith('masked'),commands:userCommands(l)})
}
let enabling=false
export async function enableAutostart():Promise<AutostartStatus>{
 if(enabling)throw new Error('Autostart setup already running')
 enabling=true
 try{
  const s=await autostartStatus()
  if(!s.canEnable)return s
  if(s.manager!=='systemd-user'||uid()===0||!s.unit)return s
  const current=await currentService()
  if(!current){
   const l=await launch();if(!l||s.unit!==unitName(l.data))throw new Error('Launch changed')
   const file=userPath(s.unit),expected=renderUnit(l)
   await mkdir(resolve(file,'..'),{recursive:true,mode:0o700})
   const f=await ownedUnit(file,expected)
   if(f==='missing')await writeFile(file,expected,{flag:'wx',mode:0o600})
   else if(f!=='match')throw new Error('Existing unit differs')
   if((await run(systemctl,['--user','daemon-reload'])).code!==0)return {...s,reason:'enable_failed'}
  }else if(!current.user||current.unit!==s.unit)throw new Error('Service changed')
  if((await run(systemctl,['--user','--no-ask-password','enable',s.unit])).code!==0)return {...s,reason:'enable_failed'}
  if(await lingerState()!==true)await run(loginctl,['--no-ask-password','enable-linger',String(uid())])
  const after=await autostartStatus()
  return after.state==='enabled'?after:{...after,reason:'linger_or_permission_required'}
 }finally{enabling=false}
}
