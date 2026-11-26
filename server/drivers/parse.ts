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
    const hex=kind==='discrete'&&/^0x[0-9a-f]+$/i.test(value)
    const n=hex?Number.parseInt(value,16):/^-?\d+(?:\.\d+)?$/.test(value)?Number(value):null
    // IPMI discrete values are event bitmaps, not generic error flags. Without SDR
    // event definitions neither a nonzero bitmap nor 0x0080 establishes health.
    const health=kind==='discrete'&&(/^0x[0-9a-f]+$/i.test(status)||hex)?'unknown':/^ok$/i.test(status)?'ok':/^(nc|cr|nr|lnc|lcr|lnr|unc|ucr|unr|fault|fail|critical|non-critical|non-recoverable)$/i.test(status)?'fault':'unknown'
    const normalizedUnit=kind==='thermal-margin'?'°C (DTS)':kind==='temperature'?'°C':kind==='power'?'W':unit
    out.push({id:name,name,kind,value:n,unit:normalizedUnit,raw:line,valid:n!==null&&health==='ok',health,at})
  }
  return out
}
