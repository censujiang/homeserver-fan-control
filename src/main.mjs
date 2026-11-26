import {readFile} from 'node:fs/promises';
import {parseSensors,decide} from './control.mjs';
const [configPath='config.example.json',sensorPath='sensors.example.txt']=process.argv.slice(2);
const cfg=JSON.parse(await readFile(configPath,'utf8'));
const rows=parseSensors(await readFile(sensorPath,'utf8'));
let state={};
for(let t=0;t<=600;t+=10){
 const r=decide(rows,cfg,state,t*1000); state=r.state;
 if(t%60===0||r.mode==='auto') console.log(JSON.stringify({simulation:true,seconds:t,mode:r.mode,fan:r.fan,reason:r.reason}));
 if(r.mode==='auto') break;
}
