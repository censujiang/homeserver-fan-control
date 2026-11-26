import { chmod, copyFile, lstat, mkdtemp, rename, rm, realpath } from 'node:fs/promises'
import { constants } from 'node:fs'
import { dirname, join } from 'node:path'
import { checkRelease, defaultChannel, downloadRelease } from '../server/core/releases'
import { currentVersion } from '../shared/release'
export async function updateCli(args:string[],compiled:boolean){
 const check=args[0]==='--check-update'
 if(args.slice(1).some(a=>a!=='--stable'&&a!=='--preview')||args.length>2)throw new Error('Usage: --check-update|--update [--stable|--preview]')
 const channel=args[1]==='--stable'?'stable':args[1]==='--preview'?'preview':defaultChannel
 const docker=process.env.HSFC_DEPLOYMENT==='docker'
 const release=await checkRelease(channel,docker?'docker':compiled?'binary':'source')
 console.log('Current: '+currentVersion)
 if(!release){console.log('No newer compatible release on '+channel+' channel');return}
 console.log('Available: '+release.tag+' '+release.url)
 if(check)return
 if(docker||!compiled||process.platform!=='linux'||process.arch!=='x64')throw new Error('Self-update is only available for the standalone Linux x64 executable; replace Docker images or rebuild source deployments.')
 const executable=await realpath(process.execPath),s=await lstat(executable)
 if(!s.isFile())throw new Error('Executable is not a regular file')
 const dir=dirname(executable),temp=await mkdtemp(join(dir,'.hsfc-update-'))
 const backup=executable+'.previous'
 try{
  const {file}=await downloadRelease(release,temp)
  await chmod(file,s.mode&0o777)
  // Preserve a previous executable before replacing the current pathname.
  // Refuse to overwrite a symlink or stale backup; the operator can move it first.
  await copyFile(executable,backup,constants.COPYFILE_EXCL)
  await chmod(backup,s.mode&0o777)
  await rename(file,executable)
  console.log('Updated to '+release.tag+'; backup: '+backup)
  console.log('Start/restart the service manually. If needed, restore the backup after stopping the service.')
 }finally{await rm(temp,{recursive:true,force:true})}
}
