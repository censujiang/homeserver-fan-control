import { test, expect } from 'bun:test'
import { LeaseController } from '../server/core/lease'
import { mock } from '../server/drivers/mock'
test('virtual lease, duplicate owner, fallback and readback',async()=>{
 const d=mock.create('mock',{}),other=mock.create('mock',{}),a=new LeaseController('a',d),b=new LeaseController('b',other)
 await a.tick(await d.sample(),40)
 expect((await d.sample()).fanLevel).toBe(40)
 await expect(b.tick(await other.sample(),40)).rejects.toThrow('Duplicate control owner')
 await a.tick(await d.sample(),null)
 expect((await d.sample()).fanMode).toBe('AUTO')
 await b.tick(await other.sample(),50)
 expect((await other.sample()).fanLevel).toBe(50)
 await b.fallback()
})

test('refuse takeover of pre-existing manual mode',async()=>{const d=mock.create('mock',{});await d.manual(40,30);const l=new LeaseController('external',d);await expect(l.tick(await d.sample(),60)).rejects.toThrow('Existing manual mode');expect((await d.sample()).fanLevel).toBe(40);await d.auto()})
