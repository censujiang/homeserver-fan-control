// Simulation only. Never use example thresholds as hardware limits.
export function parseSensors(text) {
 const rows = new Map();
 for (const line of text.split(/\r?\n/)) {
  const [name,value,unit,status]=line.split('|').map(x=>x.trim());
  if (!name || !/^(degrees C|RPM|Watts|unspecified)$/i.test(unit??'') || (unit==='unspecified'&&!/^CPU\d+ DTS$/.test(name))) continue;
  if(rows.has(name)) throw new Error(`Duplicate sensor ${name}`);
  rows.set(name,{value:/^-?\d+(?:\.\d+)?$/.test(value)?Number(value):NaN,unit,status});
 }
 return rows;
}
export function decide(rows,cfg,state={},now=Date.now()) {
 const auto=reason=>({mode:'auto',reason,state:{}});
 if(!Number.isInteger(cfg.minFan)||cfg.minFan<30||cfg.minFan>100||!cfg.sensors?.length||!cfg.fans?.length) return auto('Invalid simulation profile');
 let demand=cfg.minFan; const readings={};
 for(const s of cfg.sensors){
  const r=rows.get(s.name);
  if(!r||r.unit!==s.unit||r.status!=='ok'||!Number.isFinite(r.value)||!(s.min<=r.value&&r.value<=s.max)||!(s.min<=s.warm&&s.warm<s.hot&&s.hot<=s.max)) return auto(`Invalid ${s.name}`);
  const t=r.value; readings[s.name]=t;
  if(t>=s.hot) return auto(`Hot: ${s.name}`);
  const dt=(now-(state.time??now))/1000, old=state.readings?.[s.name];
  const rise=dt>0&&dt<=30&&Number.isFinite(old)?Math.max(0,(t-old)/dt)*20:0;
  demand=Math.max(demand,Math.min(100,Math.ceil((cfg.minFan+(100-cfg.minFan)*Math.max(0,Math.min(1,(t+rise-s.warm)/(s.hot-s.warm))))/5)*5));
 }
 for(const name of cfg.fans){
  const r=rows.get(name);
  if(!r||r.unit!=='RPM'||r.status!=='ok'||!(r.value>0)) return auto(`Fan fault: ${name}`);
 }
 for(const [name,r] of rows) if(r.status!=='ok'||!Number.isFinite(r.value)) return auto(`Sensor alarm or missing value: ${name}`);
 let fan=state.fan??100,coolSince=state.coolSince??null;
 if(demand>fan){fan=demand;coolSince=null;}
 else if(demand<=fan-5){coolSince??=now;if(now-coolSince>=60000){fan=Math.max(demand,fan-5);coolSince=now;}}
 else coolSince=null;
 return {mode:'manual',fan,reason:'Simulated thermal demand',state:{fan,time:now,readings,coolSince}};
}
