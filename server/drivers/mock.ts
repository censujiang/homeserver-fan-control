import type { Plugin, Sample } from '../../shared/model'
export const mock:Plugin={manifest:{id:'mock',name:'Simulation',description:'Virtual fan with finite lease; no physical hardware access',version:'1.0.0',apiVersion:1,modes:[{id:'mock',label:'Mock',fields:[]}]},create(){
 let target=30,until=0
 const mode=()=>Date.now()<until?'MANUAL':'AUTO'
 return {async connect(){},async identify(){return 'mock'},capabilities(){return {read:true,write:true,timedFallback:true,reason:'Mock-only virtual writes'}},async sample():Promise<Sample>{const at=Date.now();if(mode()==='AUTO')target=30;return {at,identity:'mock',health:'ok',fanMode:mode(),fanLevel:target,sensors:[{id:'cpu',name:'Mock CPU',kind:'temperature',value:35,unit:'C',raw:'35',valid:true,health:'ok',at},{id:'fan',name:'Mock fan',kind:'rpm',value:target*70,unit:'RPM',raw:String(target*70),valid:true,health:'ok',at}]}},async auto(){until=0;target=30},async manual(p,t){if(!Number.isInteger(p)||p<30||p>100||t!==30)throw new Error('Invalid virtual control');target=p;until=Date.now()+t*1000},async close(){until=0}}
}}
