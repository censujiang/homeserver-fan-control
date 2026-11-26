import { Client, type ClientChannel } from 'ssh2'
import { createHash, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import type { Driver, Plugin, Sample } from '../../shared/model'
import { parseSensors } from './parse'
import {fanState,identityFromSerial,firmwareSupported,healthOK,guardedSample,validateManualReply} from './imana-control'
const localConfig=z.object({device:z.literal('/dev/ipmi0').default('/dev/ipmi0'), timeout:z.coerce.number().int().min(1000).max(20000).default(12000)})
const sshConfig=z.object({host:z.string().trim().min(1).max(253),port:z.coerce.number().int().min(1).max(65535).default(22),username:z.string().min(1),password:z.string().optional(),privateKey:z.string().optional(),control:z.enum(['monitor','experimental']).default('monitor'),fingerprint:z.string().regex(/^SHA256:[A-Za-z0-9+/]{43}=?$/),timeout:z.coerce.number().int().min(1000).max(20000).default(10000)}).refine(x=>Boolean(x.password)!==Boolean(x.privateKey))
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
      c.connect({host:cfg.host,port:cfg.port,username:cfg.username,password:cfg.password,privateKey:cfg.privateKey,readyTimeout:cfg.timeout,hostVerifier:(key:Buffer)=>{
        const expected=Buffer.from(cfg.fingerprint.replace(/=+$/,'')), actual=Buffer.from('SHA256:'+createHash('sha256').update(key).digest('base64').replace(/=+$/,''))
        return expected.length===actual.length&&timingSafeEqual(expected,actual)
      }})
    })
  }
  connected(){return Boolean(this.channel)}
  async run(command:string){const ch=this.channel;if(!ch)throw new Error('SSH disconnected; reconnect and verify identity first');const p=this.read();ch.write(command+'\n');return p}
  close(){this.fail(new Error('Shell stopped'));this.channel?.close();this.client?.end();this.channel=undefined;this.client=undefined}
}
const blocked=(reason:string)=>({read:true,write:false,timedFallback:false,reason})
const noWrite=async()=>{throw new Error('Hardware writes not validated/enabled')}
export const imana:Plugin={
 manifest:{id:'huawei.imana200',name:'Huawei iMana 200',version:'0.4.0',apiVersion:1,description:'SSH timed fan control (experimental, explicit opt-in) and Linux OpenIPMI read-only',modes:[
 {id:'local',label:'Local IPMI',fields:[{key:'device',label:'Device',type:'text',default:'/dev/ipmi0'},{key:'timeout',label:'Timeout (ms)',type:'number',default:12000}]},
 {id:'ssh',label:'SSH',fields:[{key:'host',label:'BMC address',type:'text',required:true},{key:'port',label:'Port',type:'number',default:22},{key:'username',label:'Username',type:'text',required:true},{key:'password',label:'Password',type:'password'},{key:'privateKey',label:'Private key',type:'password'},{key:'fingerprint',label:'Pinned SHA256 fingerprint',type:'text',required:true},{key:'timeout',label:'Timeout (ms)',type:'number',default:10000},{key:'control',label:'Control: monitor / experimental',type:'text',default:'monitor'}]}]},
 create(mode,raw):Driver{
   if(mode==='local'){
     const cfg=localConfig.parse(raw)
     let identity:string|null=null
     return {async connect(){const info=await ipmi(['mc','info'],cfg.timeout);if(!/Manufacturer ID\s*:\s*2011\b/.test(info)||!/Product ID\s*:\s*(?:43649\b|0xaa81\b)/i.test(info))throw new Error('Unexpected BMC');const guid=await ipmi(['mc','guid'],cfg.timeout).catch(()=> '');identity=guid.match(/(?:System GUID|GUID)\s*:\s*([0-9a-f-]{16,})/i)?.[1]??null},
      async identify(){return identity},capabilities:()=>blocked('Local OEM writes unverified'),async sample(){const data=await ipmi(['sensor','list'],cfg.timeout);const at=Date.now();return {at,identity,health:'unknown',sensors:parseSensors(data,at)}},auto:noWrite,manual:noWrite,async close(){}}
   }
   if(mode!=='ssh')throw new Error('Unknown transport')
   const cfg=sshConfig.parse(raw),shell=new Shell(cfg)
   let identity:string|null=null,supported=false,armed=false
   let lastSample:Sample|undefined
   const canWrite=()=>cfg.control==='experimental'&&supported&&!!identity
   async function verify(){
    await shell.connect()
    const version=await shell.run('ipmcget -d version')
    supported=firmwareSupported(version)
    const serial=identityFromSerial(await shell.run('ipmcget -d serialnumber'))
    if(identity&&identity!==serial){supported=false;throw new Error('BMC serial changed')}
    identity=serial
   }
   async function auto(){
    // Only restore an owned lease, never disturb another operator's manual setting.
    if(!armed)return
    if(!shell.connected())await verify()
    if(!canWrite())throw new Error('BMC identity not verified')
    const result=await shell.run('ipmcset -d fanmode -v 0')
    if(!/Set fan mode successfully[.!]?/i.test(result)||fanState(await shell.run('ipmcget -d fanmode')).fanMode!=='AUTO')throw new Error('AUTO readback failed')
    armed=false
   }
   return {connect:verify,async identify(){return identity},
    capabilities:()=>canWrite()?{read:true,write:true,timedFallback:true,reason:'Experimental SSH: 30-second BMC lease; requires supervised validation'}:blocked(cfg.control==='monitor'?'SSH read-only; set control to experimental to opt in':'Unsupported firmware/board or missing serial identity'),
    async sample():Promise<Sample>{
     if(!shell.connected())await verify()
     const at=Date.now()
     const data=await shell.run('ipmcget -t sensor -d list')
     const health=healthOK(await shell.run('ipmcget -d health'))&&healthOK(await shell.run('ipmcget -d healthevents'))
     const mode=fanState(await shell.run('ipmcget -d fanmode'))
     const level=await shell.run('ipmcget -d fanlevel')
     const s=guardedSample(data,at,identity,health,level)
     if(mode.fanMode!==s.fanMode||!s.fanMode)s.health='unknown'
     lastSample=s
     return s
    },
    auto,async manual(percent,seconds){
     if(!canWrite()||seconds!==30||!Number.isInteger(percent)||percent<30||percent>100||!lastSample||lastSample.health!=='ok'||Date.now()-lastSample.at>10000)throw new Error('SSH control safety gate')
     // Do not take over existing manual mode unless this driver owns the lease.
     const before=fanState(await shell.run('ipmcget -d fanlevel'))
     if((!armed&&before.fanMode!=='AUTO')||(armed&&(before.fanMode!=='MANUAL'||before.fanLevel!==lastSample.fanLevel||before.remaining===undefined||before.remaining<1||before.remaining>30)))throw new Error('Unexpected external fan control')
     if(Date.now()-lastSample.at>10000)throw new Error('Stale sensor data')
     armed=true
     try{
      const m=await shell.run('ipmcset -d fanmode -v 1 30')
      if(!/Set fan mode successfully[.!]?/i.test(m))throw new Error('Manual mode command rejected')
      validateManualReply(m)
      const l=await shell.run('ipmcset -d fanlevel -v '+percent)
      if(!/Set fan level successfully[.!]?/i.test(l))throw new Error('Fan level command rejected')
      validateManualReply(l,percent)
      validateManualReply(await shell.run('ipmcget -d fanlevel'),percent)
     }catch(e){await auto().catch(()=>{});throw e}
    },async close(){try{await auto()}finally{shell.close()}}}

 }
}
