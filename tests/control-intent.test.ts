import {test,expect} from 'bun:test'
import {controlIntent} from '../server/core/control-intent'
import {defaultPolicy,type Instance} from '../shared/model'
const base:Omit<Instance,'id'>={name:'test',plugin:'huawei.imana200',transport:'ssh',config:{password:'test',control:'monitor'},mode:'MONITOR',enabled:true,policy:defaultPolicy}
test('explicit ADAPTIVE mode enables SSH writes; monitoring disables them',()=>{
 expect(controlIntent({...base,mode:'ADAPTIVE'}).config.control).toBe('experimental')
 expect(controlIntent({...base,config:{control:'experimental'}}).config.control).toBe('monitor')
 expect(controlIntent({...base,transport:'local',mode:'ADAPTIVE'}).config.control).toBe('monitor')
 expect(controlIntent({...base,mode:'ADAPTIVE'}).config.password).toBe('test')
})
