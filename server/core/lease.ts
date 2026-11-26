import type { Driver, Sample } from '../../shared/model'
const owners=new Map<string,{owner:string;expires:number}>()
export class LeaseController {
 private identity?:string
 private last=0
 private level?:number
 private active=false
 constructor(private readonly owner:string,private readonly driver:Driver){}
 async tick(s:Sample,target:number|null,now=Date.now()){
  const c=this.driver.capabilities()
  if(!c.write||!c.timedFallback||!s.identity||s.health!=='ok'||now-s.at>10000||s.at>now||target===null||!Number.isInteger(target)||target<30||target>100){
   await this.fallback();return
  }
  if(this.identity&&this.identity!==s.identity){await this.fallback();throw new Error('Hardware identity changed')}
  const lock=owners.get(s.identity)
  if(lock&&lock.owner!==this.owner&&lock.expires>now)throw new Error('Duplicate control owner')
  if(this.active&&(s.fanMode!=='MANUAL'||s.fanLevel!==this.level)){await this.fallback();throw new Error('Unexpected fan mode or target')}
  if(this.active&&now-this.last<8000&&target===this.level)return
  this.identity=s.identity
  owners.set(s.identity,{owner:this.owner,expires:now+45000})
  this.active=true
  try{
   await this.driver.manual(target,30)
   const confirm=await this.driver.sample()
   if(confirm.identity!==this.identity||confirm.health!=='ok'||confirm.fanMode!=='MANUAL'||confirm.fanLevel!==target||Date.now()-confirm.at>10000)throw new Error('Manual readback mismatch')
   this.last=now;this.level=target
  }catch(e){await this.fallback();throw e}
 }
 async fallback(){
  if(!this.active)return
  this.active=false;this.level=undefined;this.last=0
  try{
   await this.driver.auto()
   const s=await this.driver.sample()
   if(s.identity===this.identity&&s.fanMode==='AUTO'&&this.identity&&owners.get(this.identity)?.owner===this.owner)owners.delete(this.identity)
  }catch{/* Stop renewal; hardware timeout is the fallback. Keep lock until lease expiry. */}
 }
}
