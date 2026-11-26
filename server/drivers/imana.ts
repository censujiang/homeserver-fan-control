import { Client, type ClientChannel } from 'ssh2'
import { createHash, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import type { Driver, Plugin, Sample } from '../../shared/model'
import { parseSensors } from './parse'
const localConfig=z.object({device:z.literal('/dev/ipmi0').default('/dev/ipmi0'), timeout:z.coerce.number().int().min(1000).max(20000).default(12000)})
const sshConfig=z.object({host:z.string().trim().min(1).max(253),port:z.coerce.number().int().min(1).max(65535).default(22),username:z.string().min(1),password:z.string().optional(),privateKey:z.string().optional(),fingerprint:z.string().regex(/^SHA256:[A-Za-z0-9+/]{43}=?$/),timeout:z.coerce.number().int().min(1000).max(20000).default(10000)}).refine(x=>Boolean(x.password)!==Boolean(x.privateKey))
async function ipmi(args:string[],timeout:number){
  const child=Bun.spawn(['/usr/bin/ipmitool','-I','open',...args],{stdout:'pipe',stderr:'pipe',env:{PATH:'/usr/bin:/bin',LC_ALL:'C'}})
  const timer=setTimeout(()=>child.kill(9),timeout)
  try{
    const [code,stdout]=await Promise.all([child.exited,new Response(child.stdout).text(),new Response(child.stderr).text()])
    if(code!==0)throw new Error('IPMI command failed')
    return stdout
  }finally{clearTimeout(timer)}
}
class Shell {
  private client?:Client
  private channel?:ClientChannel
  private waiter?:{resolve:(s:string)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>}
  private buffer=''
  private readonly prompt=/(?:^|\n)[^\r\n]{0,80}(?:iMana[^\r\n]*[>#]|[>#])\s*$/i
  constructor(private config:z.infer<typeof sshConfig>){}
  private consume(s:string){
    if(!this.waiter)return
    this.buffer+=s.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g,'')
    if(this.buffer.length>1024*1024){this.fail(new Error('SSH response too large'));this.close();return}
    if(this.prompt.test(this.buffer)){
      const w=this.waiter;this.waiter=undefined;clearTimeout(w.timer);w.resolve(this.buffer)
    }
  }
  private fail(e:Error){const w=this.waiter;this.waiter=undefined;if(w){clearTimeout(w.timer);w.reject(e)}}
  private read():Promise<string>{
    if(this.waiter)throw new Error('Concurrent SSH command')
    this.buffer=''
    return new Promise((resolve,reject)=>{this.waiter={resolve,reject,timer:setTimeout(()=>{this.fail(new Error('SSH prompt timeout'));this.close()},this.config.timeout)}})
  }
  async connect(){
    if(this.channel)return
    const c=this.client=new Client(), cfg=this.config
    await new Promise<void>((resolve,reject)=>{
      const timer=setTimeout(()=>{c.end();reject(new Error('SSH connect timeout'))},cfg.timeout)
      c.on('error',e=>{clearTimeout(timer);this.fail(e);reject(e)})
      c.on('close',()=>{this.channel=undefined;this.fail(new Error('SSH disconnected'))})
      c.once('ready',()=>c.shell((err,ch)=>{
        clearTimeout(timer)
        if(err){c.end();reject(err);return}
        this.channel=ch
        const pending=this.read()
        ch.on('data',(data:Buffer)=>this.consume(data.toString()))
        ch.on('close',()=>{this.channel=undefined;this.fail(new Error('Shell closed'))})
        pending.then(()=>resolve(),reject)
      }))
      c.connect({host:cfg.host,port:cfg.port,username:cfg.username,password:cfg.password,privateKey:cfg.privateKey,readyTimeout:cfg.timeout,hostVerifier:key=>{
        const expected=Buffer.from(cfg.fingerprint.replace(/=+$/,'')), actual=Buffer.from('SHA256:'+createHash('sha256').update(key).digest('base64').replace(/=+$/,''))
        return expected.length===actual.length&&timingSafeEqual(expected,actual)
      }})
    })
  }
  async run(command:string){await this.connect();const p=this.read();this.channel!.write(command+'\n');return p}
  close(){this.fail(new Error('Shell stopped'));this.channel?.close();this.client?.end();this.channel=undefined;this.client=undefined}
}
const blocked=(reason:string)=>({read:true,write:false,timedFallback:false,reason})
const noWrite=async()=>{throw new Error('Hardware writes not validated/enabled')}
export const imana:Plugin={
 manifest:{id:'huawei.imana200',name:'Huawei iMana 200',version:'0.3.0',apiVersion:1,description:'SSH interactive shell and Linux OpenIPMI',modes:[
 {id:'local',label:'Local IPMI',fields:[{key:'device',label:'Device',type:'text',default:'/dev/ipmi0'},{key:'timeout',label:'Timeout (ms)',type:'number',default:12000}]},
 {id:'ssh',label:'SSH',fields:[{key:'host',label:'BMC address',type:'text',required:true},{key:'port',label:'Port',type:'number',default:22},{key:'username',label:'Username',type:'text',required:true},{key:'password',label:'Password',type:'password'},{key:'privateKey',label:'Private key',type:'password'},{key:'fingerprint',label:'Pinned SHA256 fingerprint',type:'text',required:true},{key:'timeout',label:'Timeout (ms)',type:'number',default:10000}]}]},
 create(mode,raw):Driver{
   if(mode==='local'){
     const cfg=localConfig.parse(raw)
     let identity:string|null=null
     return {async connect(){const info=await ipmi(['mc','info'],cfg.timeout);if(!/Manufacturer ID\s*:\s*2011\b/.test(info)||!/Product ID\s*:\s*(?:43649\b|0xaa81\b)/i.test(info))throw new Error('Unexpected BMC');const guid=await ipmi(['mc','guid'],cfg.timeout).catch(()=> '');identity=guid.match(/(?:System GUID|GUID)\s*:\s*([0-9a-f-]{16,})/i)?.[1]??null},
      async identify(){return identity},capabilities:()=>blocked('Local OEM writes unverified'),async sample(){const data=await ipmi(['sensor','list'],cfg.timeout);const at=Date.now();return {at,identity,health:'unknown',sensors:parseSensors(data,at)}},auto:noWrite,manual:noWrite,async close(){}}
   }
   if(mode!=='ssh')throw new Error('Unknown transport')
   const shell=new Shell(sshConfig.parse(raw))
   return {connect:()=>shell.connect(),async identify(){return null},capabilities:()=>blocked('SSH identity, health parsing and repeated lease renewal require validation'),async sample():Promise<Sample>{
     const data=await shell.run('ipmcget -t sensor -d list')
     const fanMode=await shell.run('ipmcget -d fanmode')
     const fanLevel=await shell.run('ipmcget -d fanlevel')
     const at=Date.now()
     return {at,identity:null,health:'unknown',sensors:parseSensors(data,at),fanMode:fanMode.match(/\b(?:auto|manual)\b/i)?.[0],fanLevel:Number(fanLevel.match(/(\d{1,3})\s*%/)?.[1])||undefined}
   },auto:noWrite,manual:noWrite,async close(){shell.close()}}
 }
}
