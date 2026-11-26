import {test,expect} from 'bun:test'
import {decide} from '../server/core/engine'
import {parseSensors} from '../server/drivers/parse'
import {defaultPolicy,type Sample} from '../shared/model'
const p={...defaultPolicy,sensors:[{id:'CPU1 DTS',warm:-35,hot:-20}],fans:['FAN1']}
const make=(value=-60,rpm=2100,at=100000):Sample=>({at,identity:'mock',health:'ok',sensors:parseSensors('CPU1 DTS | '+value+' | unspecified | ok\nFAN1 | '+rpm+' | RPM | ok',at)})
test('DTS signed value and semantic type',()=>{const s=make().sensors[0]!;expect(s.kind).toBe('thermal-margin');expect(s.value).toBe(-60)})
test('hot, stale, missing and stalled fan fail closed',()=>{expect(decide(make(-10),p,undefined,100000).target).toBeNull();expect(decide(make(),p,undefined,120000).target).toBeNull();expect(decide(make(-60,0),p,undefined,100000).target).toBeNull();expect(decide({...make(),sensors:[]},p,undefined,100000).target).toBeNull()})
test('delayed reduction and no below floor',()=>{const a=decide(make(),p,undefined,100000);expect(a.target).toBe(100);expect(decide(make(-60,2100,160000),p,a.state,160000).target).toBe(95)})
test('bad health fails closed',()=>expect(decide({...make(),health:'unknown'},p,undefined,100000).target).toBeNull())
