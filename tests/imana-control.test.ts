import {test,expect} from 'bun:test'
import {fanState,validateManualReply,identityFromSerial,firmwareSupported,healthOK,guardedSample,imanaFans,imanaPolicy} from '../server/drivers/imana-control'
import {defaultPolicy} from '../shared/model'
import {decide} from '../server/core/engine'
test('recorded iMana 7.38 replies and strict timeout/readback',()=>{
 const reply='Set fan mode successfully.\r\nCurrent Mode:        manual, timeout 30 seconds.\r\nManual Fan Level:    30%\r\n'
 expect(fanState(reply)).toEqual({fanMode:'MANUAL',fanLevel:30,remaining:30})
 expect(fanState('Get fanlevel successfully!\r\nCurrent mode:manual,timeout 30 seconds.\r\nManual fan level:    30\r\n')).toEqual({fanMode:'MANUAL',fanLevel:30,remaining:30})
 expect(fanState('Current mode: auto.').fanMode).toBe('AUTO')
 expect(()=>validateManualReply(reply,30)).not.toThrow()
 expect(()=>validateManualReply(reply.replace('30 seconds','0 seconds'),30)).toThrow()
 expect(()=>validateManualReply(reply.replace('30 seconds','300 seconds'),30)).toThrow()
 expect(()=>validateManualReply(reply,35)).toThrow()
 expect(identityFromSerial('System SN is: 000000000')).toBeNull()
 expect(identityFromSerial('System SN is: 021D1J10B9800027')).toMatch(/^huawei-serial:/)
 expect(firmwareSupported('Active iMana        Version:           (U1029)7.38\r\nMainboard           BoardID:           0xaa09\r\n')).toBe(true)
 expect(firmwareSupported('Active iMana Version: 7.39\nMainboard BoardID: 0xaa09')).toBe(false)
 expect(healthOK('System in health state.')).toBe(true)
 expect(healthOK('System in fault state.')).toBe(false)
})
test('physical safety policy mandates all rotors and both CPUs/inlet',()=>{
 const p=imanaPolicy({...defaultPolicy,min:1,max:20,sensors:[{id:'CPU1 DTS',warm:-10,hot:-1}]})
 expect(p.min).toBe(30);expect(p.max).toBe(100);expect(p.fans.length).toBe(8)
 expect(p.sensors.find(x=>x.id==='CPU1 DTS')?.hot).toBe(-25)
 const rows=['CPU1 DTS | -46 | unspecified | ok','CPU2 DTS | -49 | unspecified | ok','Inlet Temp | 28 | degrees C | ok',...imanaFans.map(f=>f+' | 2160 | RPM | ok')]
 const sample=guardedSample(rows.join('\n'),1000,'id',true,'Current mode: auto.')
 expect(sample.health).toBe('ok')
 expect(decide(sample,p,undefined,1000).target).toBe(100)
 expect(decide({...sample,health:'unknown'},p,undefined,1000).target).toBeNull()
 expect(guardedSample(rows.slice(0,-1).join('\n'),1000,'id',true,'Current mode: auto.').health).toBe('unknown')
 expect(decide(guardedSample(rows.join('\n').replace('-46','-20'),1000,'id',true,'Current mode: auto.'),p,undefined,1000).target).toBeNull()
})
