import {createHash,randomBytes} from 'node:crypto'
import {createReadStream,constants} from 'node:fs'
import {access,chmod,copyFile,lstat,mkdtemp,readFile,realpath,rename,rm,writeFile,mkdir} from 'node:fs/promises'
import {dirname,join,resolve} from 'node:path'
import {currentVersion,binaryAsset} from '../shared/release'
import {compareVersions} from '../server/core/releases'
export interface InstallRequest {tag:string;size:number;sha256:string}
export function validRequest(x:InstallRequest,version:string){
 try{return /^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(x.tag)&&compareVersions(x.tag,version)>0&&Number.isSafeInteger(x.size)&&x.size>0&&x.size<=256*1024*1024&&/^[a-f0-9]{64}$/.test(x.sha256)}catch{return false}
}
export async function verifiedCandidate(path:string,r:InstallRequest){
 const st=await lstat(path)
 if(!st.isFile()||st.isSymbolicLink()||st.uid!==process.getuid?.()||st.size!==r.size||(st.mode&0o022)!==0)throw new Error('Unsafe candidate')
 const h=createHash('sha256');for await(const chunk of createReadStream(path))h.update(chunk)
 if(h.digest('hex')!==r.sha256)throw new Error('Candidate checksum mismatch')
}
async function result(data:string,tag:string,status:'pending'|'success'|'failed'|'rolled-back'){
 const p=join(data,'update-result.json'),tmp=p+'.'+randomBytes(6).toString('hex')
 try{await writeFile(tmp,JSON.stringify({tag,status,at:Date.now()}),{flag:'wx',mode:0o600});await rename(tmp,p)}finally{await rm(tmp,{force:true})}
}
export async function supervise(){
 const exe=await realpath(process.execPath),data=resolve(process.env.HSFC_DATA_DIR??'./data')
 await mkdir(data,{recursive:true,mode:0o700})
 const d=await lstat(data)
 if(!d.isDirectory()||d.isSymbolicLink()||d.uid!==process.getuid?.()||(d.mode&0o022)!==0)throw new Error('Data directory must be privately owned')
 const session=await mkdtemp(join(data,'.supervisor-')),request=join(session,'request.json'),token=randomBytes(32).toString('hex')
 const env={...process.env,HSFC_SUPERVISOR_PID:String(process.pid),HSFC_SUPERVISOR_TOKEN:token,HSFC_UPDATE_REQUEST:request}
 const args=process.argv.slice(2)
 let exited=false,stopping=false,version=currentVersion
 const children:{current:ReturnType<typeof launchChild>|null}={current:null}
 const launchChild=()=>Bun.spawn([exe,'--serve',...args],{env,stdin:'ignore',stdout:'inherit',stderr:'inherit'});
 const launch=()=>{exited=false;const p=launchChild();children.current=p;void p.exited.then(()=>{if(children.current===p)exited=true});return p}
 const stop=async()=>{const p=children.current;if(!p)return; p.kill('SIGTERM');let timer:ReturnType<typeof setTimeout>|undefined;const done=await Promise.race([p.exited.then(()=>true),new Promise<boolean>(r=>{timer=setTimeout(()=>r(false),90000)})]);clearTimeout(timer);if(!done){p.kill('SIGKILL');await p.exited}children.current=null}
 const signal=()=>{stopping=true;children.current?.kill('SIGTERM')}
 process.on('SIGTERM',signal);process.on('SIGINT',signal)
 const host=process.env.NITRO_HOST??'127.0.0.1',port=process.env.NITRO_PORT??'3000'
 const address=host==='0.0.0.0'?'127.0.0.1':host==='::'?'[::1]':host.includes(':')&&!host.startsWith('[')?'['+host+']':host
 const healthy=async(expected:string)=>{
  for(let n=0;n<45&&!stopping&&!exited;n++){
   try{const r=await fetch('http://'+address+':'+port+'/api/update/health',{headers:{'x-hsfc-supervisor':token},signal:AbortSignal.timeout(1500)})
    if(r.ok&&(await r.json()).version===expected)return true
   }catch{/* service is starting */}
   await Bun.sleep(1000)
  }return false
 }
 try{
  launch()
  while(!stopping&&!exited){
   await Bun.sleep(500)
   if(stopping||exited)break
   let raw:string
   try{raw=await readFile(request,'utf8')}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')continue;throw e}
   await rm(request,{force:true})
   let r:InstallRequest
   try{r=JSON.parse(raw);if(!validRequest(r,version))throw new Error('Invalid request')}catch{console.error('Rejected update request');continue}
   let work:string|undefined,backup:string|undefined,installed=false
   try{
    const old=await lstat(exe),dir=dirname(exe),owner=process.getuid?.(),directory=await lstat(dir)
    if(!old.isFile()||old.uid!==owner||(old.mode&0o022)!==0||!directory.isDirectory()||directory.uid!==owner||(directory.mode&0o022)!==0)throw new Error('Unsafe executable ownership')
    await access(dir,constants.W_OK)
    // Never install from a mutable pathname: copy into a private directory first and hash that copy.
    work=await mkdtemp(join(dir,'.hsfc-install-'))
    const staged=join(data,'updates',r.tag+'-'+binaryAsset),candidate=join(work,'candidate')
    await verifiedCandidate(staged,r);await copyFile(staged,candidate,constants.COPYFILE_EXCL)
    await verifiedCandidate(candidate,r);await chmod(candidate,old.mode&0o777)
    const check=Bun.spawn([candidate,'--version'],{stdout:'pipe',stderr:'ignore',stdin:'ignore'})
    const timer=setTimeout(()=>check.kill('SIGKILL'),10000)
    try{const [code,out]=await Promise.all([check.exited,new Response(check.stdout).text()]);if(code!==0||out.trim()!==r.tag.slice(1))throw new Error('Candidate version check failed')}finally{clearTimeout(timer)}
    if(stopping)break
    await result(data,r.tag,'pending')
    await stop()
    if(stopping)break
    backup=exe+'.previous-'+version+'-'+Date.now()
    await copyFile(exe,backup,constants.COPYFILE_EXCL);await chmod(backup,old.mode&0o777)
    // Preserve a cold SQLite backup for manual recovery across schema changes.
    const snapshot=join(data,'updates','backup-'+version+'-'+Date.now())
    await mkdir(snapshot,{mode:0o700})
    for(const name of ['database.sqlite','database.sqlite-wal','database.sqlite-shm','config.key']){
     try{await copyFile(join(data,name),join(snapshot,name),constants.COPYFILE_EXCL)}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e}
    }
    await rename(candidate,exe);installed=true
    launch()
    if(!await healthy(r.tag.slice(1)))throw new Error('Updated service failed health check')
    version=r.tag.slice(1);await result(data,r.tag,'success');console.log('Update installed: '+r.tag)
   }catch(e){
    console.error('Update failed: '+(e as Error).message)
    if(installed&&backup){await stop();await copyFile(backup,join(work!,'rollback'),constants.COPYFILE_EXCL);await chmod(join(work!,'rollback'),(await lstat(backup)).mode&0o777);await rename(join(work!,'rollback'),exe)}
    // Restart the original child even if preflight failed, clearing maintenance mode.
    if(!stopping){await stop();launch()}
    await result(data,r.tag,installed?'rolled-back':'failed')
    if(!stopping&&installed&&!await healthy(version)){console.error('Rollback did not pass health check; inspect logs and data backup');await stop();break}
   }finally{if(work)await rm(work,{recursive:true,force:true})}
  }
  const code=stopping?0:children.current?await children.current.exited:1
  process.exitCode=code
 }finally{if(children.current&&!exited)await stop();await rm(session,{recursive:true,force:true});process.off('SIGTERM',signal);process.off('SIGINT',signal)}
}
