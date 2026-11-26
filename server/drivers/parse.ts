import type { Sensor, SensorKind } from '../../shared/model'
export function parseSensors(text:string,at=Date.now()):Sensor[]{
  const out:Sensor[]=[]
  for(const line of text.split(/\r?\n/)){
    const [name,value,unit,status]=line.split('|').map(s=>s.trim())
    if(!name||!value||!unit||!status||/^sensor name$/i.test(name))continue
    let kind:SensorKind='discrete'
    if(/^CPU\d+ DTS$/i.test(name))kind='thermal-margin'
    else if(/degrees C|^C$|Celsius/i.test(unit))kind='temperature'
    else if(/^RPM$/i.test(unit))kind='rpm'
    else if(/watts|^W$/i.test(unit))kind='power'
    else if(/percent|^%$/i.test(unit))kind='percent'
    const n=/^-?\d+(?:\.\d+)?$/.test(value)?Number(value):null
    const health=/^ok$/i.test(status)?'ok':/^(ns|na|unknown|disabled|nr)$/i.test(status)?'unknown':'fault'
    out.push({id:name,name,kind,value:n,unit,raw:line,valid:n!==null&&health==='ok',health,at})
  }
  return out
}
