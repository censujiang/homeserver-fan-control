// Read-only Linux host monitor; deliberately contains no fan-control writes.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile} from 'node:fs/promises';
import {parseSensors,decide} from './control.mjs';
const exec=promisify(execFile);
const cfg=JSON.parse(await readFile(process.argv.slice(2).find(a=>!a.startsWith('--'))??'config.example.json','utf8'));
const once=process.argv.includes('--once');
let stopping=false,state={};
process.on('SIGINT',()=>{stopping=true;});
process.on('SIGTERM',()=>{stopping=true;});
const poll=async(args)=>(await exec('/usr/bin/ipmitool',['-I','open',...args],{timeout:12000,maxBuffer:1024*1024,env:{...process.env,LC_ALL:'C'}})).stdout;
const info=await poll(['mc','info']);
if(!/Manufacturer ID\s*:\s*2011\b/.test(info)) throw new Error('Expected Huawei BMC');
console.log(JSON.stringify({type:'startup',readOnly:true,info}));
do {
 try {
  const rows=parseSensors(await poll(['sensor','list']));
  const result=decide(rows,cfg,state);
  state=result.state;
  console.log(JSON.stringify({type:'sample',at:new Date().toISOString(),readOnly:true,sensors:Object.fromEntries(rows),simulation:{mode:result.mode,fan:result.fan,reason:result.reason}}));
 } catch(error){
  state={};
  console.error(JSON.stringify({type:'error',readOnly:true,reason:String(error.message),recommendation:'leave BMC in auto'}));
  if(once) process.exitCode=1;
 }
 if(!once&&!stopping) await new Promise(r=>setTimeout(r,5000));
}while(!once&&!stopping);
