import {test,expect} from 'bun:test'
import {parseSensors} from '../server/drivers/parse'
test('real iMana discrete bitmaps are not faults',()=>{
 const s=parseSensors('CPU1 Status | 0x80 | discrete | 0x8080\nDIMM000 | 0x40 | discrete | 0x4080\nPS1 Status | 0x0 | discrete | 0x0080\nCPU1 DTS | -46.000 | unspecified | ok\nInlet Temp | 28.000 | degrees C | ok\nFAN1 F Speed | 2400.000 | RPM | ok\nTemp | na | degrees C | ns\nHot | 90 | degrees C | cr',123)
 expect(s.slice(0,3).map(x=>x.value)).toEqual([128,64,0])
 expect(s.slice(0,3).every(x=>x.health==='unknown'&&!x.valid)).toBe(true)
 expect(s[3]).toMatchObject({kind:'thermal-margin',value:-46,unit:'°C (DTS)',health:'ok'})
 expect(s[4]).toMatchObject({kind:'temperature',unit:'°C',value:28})
 expect(s[5]).toMatchObject({kind:'rpm',value:2400})
 expect(s[6]).toMatchObject({health:'unknown',value:null,valid:false})
 expect(s[7]).toMatchObject({health:'fault',valid:false})
})
