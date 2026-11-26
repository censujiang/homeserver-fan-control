import type { Policy, Sample } from '../../shared/model'
export interface State { target:number; at:number; values:Record<string,number>; coolSince:number|null }
export interface Decision { target:number|null; reason:string; state?:State }
export function decide(sample:Sample,p:Policy,previous?:State,now=Date.now()):Decision {
  const fail=(reason:string):Decision=>({target:null,reason})
  if(!p.adaptive) return fail('Adaptive disabled')
  if(!sample.identity || sample.health!=='ok' || now-sample.at>10000 || sample.at>now || !p.sensors.length || !p.fans.length) return fail('Missing identity, health, fresh data or policy')
  const rows=new Map(sample.sensors.map(s=>[s.id,s]))
  if(rows.size!==sample.sensors.length) return fail('Duplicate sensors')
  const valid=(id:string)=>{const s=rows.get(id);return s?.valid && s.health==='ok' && s.value!==null && Number.isFinite(s.value) && now-s.at<=10000 && s.at<=now?s:undefined}
  for(const id of p.fans){const s=valid(id);if(!s || s.kind!=='rpm' || s.value!<=0)return fail('Fan fault: '+id)}
  let demand=p.min
  const values:Record<string,number>={}
  for(const rule of p.sensors){
    const s=valid(rule.id)
    if(!s || !['temperature','thermal-margin'].includes(s.kind)) return fail('Missing sensor: '+rule.id)
    const v=s.value!
    values[rule.id]=v
    if(v>=rule.hot)return fail('Protection threshold: '+rule.id)
    const dt=previous?(now-previous.at)/1000:0
    const old=previous?.values[rule.id]
    const rate=dt>0 && dt<=30 && old!==undefined?(v-old)/dt:0
    if(rate>3)return fail('Rapid heating: '+rule.id)
    const projected=v+Math.max(0,rate)*p.prediction
    if(projected>=rule.hot)return fail('Predicted overheating: '+rule.id)
    const warm=rule.warm-(previous && previous.target>p.min?p.hysteresis:0)
    demand=Math.max(demand,p.min+(p.max-p.min)*Math.max(0,Math.min(1,(projected-warm)/(rule.hot-warm))))
  }
  demand=Math.min(p.max,Math.ceil(demand/p.step)*p.step)
  let target=previous?.target??p.max, coolSince=previous?.coolSince??null
  if(demand>target){target=demand;coolSince=null}
  else if(demand<=target-p.step){coolSince??=now;if(now-coolSince>=p.delay*1000){target=Math.max(demand,target-p.step);coolSince=now}}
  else coolSince=null
  return {target,reason:'Maximum thermal demand; delayed cooling',state:{target,at:now,values,coolSince}}
}
