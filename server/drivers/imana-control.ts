import {createHash} from 'node:crypto'
import {ControlError} from '../core/control-error'
import {parseSensors} from './parse'
import type {Sample,Policy} from '../../shared/model'
export const imanaFans=Array.from({length:4},(_,n)=>['F','R'].map(side=>'FAN'+(n+1)+' '+side+' Speed')).flat()
export const imanaRules=[{id:'CPU1 DTS',warm:-40,hot:-25},{id:'CPU2 DTS',warm:-40,hot:-25},{id:'Inlet Temp',warm:32,hot:38}]
export function imanaPolicy(p:Policy):Policy{
 // Always protect every rotor, both CPUs and inlet. User rules may only
 // make the mandatory thresholds more conservative, never weaken them.
 const rules=new Map(p.sensors.map(x=>[x.id,x]))
 for(const r of imanaRules){const x=rules.get(r.id);const hot=Math.min(r.hot,x?.hot??r.hot);rules.set(r.id,{id:r.id,hot,warm:Math.min(r.warm,x?.warm??r.warm,hot-1)})}
 return {...p,min:Math.max(30,p.min),max:100,sensors:[...rules.values()],fans:[...new Set([...p.fans,...imanaFans])]}
}
export function fanState(text:string){
 const mode=text.match(/^\s*Current Mode:\s*(auto|manual)\b([^\r\n]*)/im)
 if(!mode)return {}
 if(mode[1]!.toLowerCase()==='auto')return {fanMode:'AUTO'}
 const level=text.match(/^\s*Manual Fan Level:\s*(\d{1,3})\s*%?\s*$/im)
 const seconds=mode[2]?.match(/timeout\s+(\d+)\s+seconds?\b/i)
 const fanLevel=level?Number(level[1]):undefined,remaining=seconds?Number(seconds[1]):undefined
 return {fanMode:'MANUAL',fanLevel:fanLevel!==undefined&&fanLevel<=100?fanLevel:undefined,remaining}
}
export function identityFromSerial(text:string){
 const sn=text.match(/^\s*System SN is:\s*([A-Za-z0-9-]{6,64})\s*$/im)?.[1]
 if(!sn||/^(.+)\1+$/.test(sn)||/^(?:unknown|default|notavailable|none)$/i.test(sn))return null
 return 'huawei-serial:'+createHash('sha256').update(sn.toUpperCase()).digest('hex')
}
export function firmwareSupported(text:string){return /^\s*Active iMana\s+Version:\s*(?:\(U1029\))?7\.38\s*$/im.test(text)&&/^\s*Mainboard\s+BoardID:\s*0xaa09\s*$/im.test(text)}
export function healthOK(text:string){return text.split(/\r?\n/).some(line=>line.trim()==='System in health state.')}
export function guardedSample(text:string,at:number,identity:string|null,health:boolean,fan:string):Sample{
 const sensors=parseSensors(text,at),state=fanState(fan)
 const required=[...imanaRules.map(r=>r.id),...imanaFans]
 const safe=required.every(id=>{const s=sensors.filter(x=>x.id===id);return s.length===1&&s[0]!.valid&&s[0]!.value!==null&&(s[0]!.kind!=='rpm'||s[0]!.value!>0)})
 const fault=sensors.some(s=>s.health==='fault')
 return {at,identity,health:fault?'fault':health&&safe?'ok':'unknown',sensors,fanMode:state.fanMode,fanLevel:state.fanLevel,leaseRemaining:state.remaining}
}
export function validateManualReply(text:string,expected?:number){
 const s=fanState(text)
 if(s.fanMode!=='MANUAL'||s.remaining===undefined||s.remaining<1||s.remaining>30||(expected!==undefined&&s.fanLevel!==expected))throw new ControlError('Timed fan-mode readback mismatch')
}

/** Real BMC commands: injected transport permits a regression test of the exact
 * command sequence without touching hardware. Never accept 0% or an infinite lease. */
export async function writeTimedFan(run:(command:string)=>Promise<string>,percent:number){
 if(!Number.isInteger(percent)||percent<30||percent>100)throw new ControlError('Unsupported physical fan target (30–100%)')
 const m=await run('ipmcset -d fanmode -v 1 30')
 if(!/Set fan mode successfully[.!]?/i.test(m))throw new ControlError('BMC rejected manual mode')
 validateManualReply(m)
 const l=await run('ipmcset -d fanlevel -v '+percent)
 if(!/Set fan level successfully[.!]?/i.test(l))throw new ControlError('BMC rejected requested fan level')
 validateManualReply(l,percent)
 validateManualReply(await run('ipmcget -d fanlevel'),percent)
}
export async function restoreFactoryAuto(run:(command:string)=>Promise<string>){
 const result=await run('ipmcset -d fanmode -v 0')
 if(!/Set fan mode successfully[.!]?/i.test(result)||fanState(await run('ipmcget -d fanmode')).fanMode!=='AUTO')throw new ControlError('BMC AUTO readback failed')
}
