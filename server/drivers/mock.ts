import type { Plugin, Sample } from '../../shared/model'
export const mock:Plugin={manifest:{id:'mock',name:'Simulation',description:'No hardware writes',version:'1.0.0',apiVersion:1,modes:[{id:'mock',label:'Mock',fields:[]}]},create(){
 let target=30
 return {async connect(){},async identify(){return 'mock'},capabilities(){return {read:true,write:false,timedFallback:false,reason:'Simulation only'}},async sample():Promise<Sample>{const at=Date.now();return {at,identity:'mock',health:'ok',fanMode:'AUTO',fanLevel:target,sensors:[{id:'cpu',name:'Mock CPU',kind:'temperature',value:35,unit:'C',raw:'35',valid:true,health:'ok',at},{id:'fan',name:'Mock fan',kind:'rpm',value:2100,unit:'RPM',raw:'2100',valid:true,health:'ok',at}]}},async auto(){target=30},async manual(){throw new Error('Mock cannot write')},async close(){}}
}}
