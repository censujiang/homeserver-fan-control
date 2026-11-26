import { database, instances, event } from './db'
import { plugins } from './registry'
import { decide, type Decision } from './engine'
import type { Capability, Driver, Instance, Sample } from '../../shared/model'
export interface Live { sample?:Sample; decision?:Decision; capability?:Capability; online:boolean; error?:string }
class Runner{
 live:Live={online:false}
 private driver?:Driver
 private timer?:ReturnType<typeof setTimeout>
 private pending?:Promise<void>
 private stopped=false
 private lastSave=0
 constructor(readonly instance:Instance){}
 start(){this.schedule(0)}
 private schedule(ms:number){if(!this.stopped)this.timer=setTimeout(()=>{this.pending=this.poll().finally(()=>{this.pending=undefined;this.schedule(5000)})},ms)}
 private async poll(){
  const i=this.instance
  try{
   if(!this.driver){const plugin=plugins.get(i.plugin);if(!plugin)throw new Error('Plugin unavailable');this.driver=plugin.create(i.transport,i.config);await this.driver.connect()}
   const sample=await this.driver.sample()
   const capability=this.driver.capabilities()
   const decision= i.mode==='DRY_RUN'?decide(sample,i.policy,this.live.decision?.state):undefined
   this.live={online:true,sample,capability,decision}
   if(Date.now()-this.lastSave>=30000){database().run('INSERT OR REPLACE INTO samples VALUES(?,?,?)',[i.id,sample.at,JSON.stringify(this.live)]);this.lastSave=Date.now()}
  }catch{
   if(this.live.online||!this.live.error)event('Monitoring failed; no hardware writes',i.id)
   this.live={online:false,error:'Connection or sampling failed'}
   await this.driver?.close().catch(()=>{});this.driver=undefined
  }
 }
 async stop(){this.stopped=true;clearTimeout(this.timer);await this.pending;await this.driver?.close();this.live={online:false}}
}
class Monitor{
 private runners=new Map<string,Runner>()
 private cleanup?:ReturnType<typeof setInterval>
 private started=false
 start(){if(this.started)return;this.started=true;database();for(const i of instances())if(i.enabled)this.add(i);this.cleanup=setInterval(()=>{const cutoff=Date.now()-30*86400000;database().run('DELETE FROM samples WHERE at<?',[cutoff]);database().run('DELETE FROM events WHERE at<?',[cutoff])},3600000)}
 add(i:Instance){if(this.runners.has(i.id))throw new Error('Duplicate runner');if(i.enabled){const r=new Runner(i);this.runners.set(i.id,r);r.start()}}
 async remove(id:string){const r=this.runners.get(id);if(r){await r.stop();this.runners.delete(id)}}
 get(id:string){return this.runners.get(id)?.live??{online:false}}
 async stop(){this.started=false;clearInterval(this.cleanup);await Promise.all([...this.runners.keys()].map(id=>this.remove(id)))}
}
export const monitor=new Monitor()
