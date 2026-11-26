import { z } from 'zod'
export const modes = ['AUTO','MONITOR','DRY_RUN','ADAPTIVE','FAILSAFE'] as const
export type Mode = typeof modes[number]
export const policySchema = z.object({
  min: z.number().int().min(1).max(100).default(30),
  max: z.number().int().min(1).max(100).default(100),
  step: z.number().int().min(1).max(20).default(5),
  delay: z.number().int().min(60).max(3600).default(60),
  hysteresis: z.number().min(0).max(20).default(2),
  prediction: z.number().int().min(0).max(30).default(20),
  adaptive: z.boolean().default(true),
  sensors: z.array(z.object({ id:z.string().min(1), warm:z.number().finite(), hot:z.number().finite() }).refine(x=>x.hot>x.warm)).max(128).default([]),
  fans: z.array(z.string().min(1)).max(128).default([]),
}).refine(x=>x.max>=x.min && new Set(x.sensors.map(s=>s.id)).size===x.sensors.length && new Set(x.fans).size===x.fans.length)
export type Policy = z.infer<typeof policySchema>
export const defaultPolicy: Policy = policySchema.parse({})
export type SensorKind = 'temperature'|'thermal-margin'|'power'|'rpm'|'percent'|'discrete'
export interface Sensor { id:string; name:string; kind:SensorKind; value:number|null; unit:string; raw:string; valid:boolean; health:'ok'|'unknown'|'fault'; at:number }
export interface Sample { at:number; identity:string|null; health:'ok'|'unknown'|'fault'; sensors:Sensor[]; fanMode?:string; fanLevel?:number }
export interface Capability { read:boolean; write:boolean; timedFallback:boolean; reason:string }
export interface Field { key:string; label:string; type:'text'|'password'|'number'; required?:boolean; default?:string|number }
export interface Manifest { id:string; name:string; version:string; apiVersion:1; description:string; modes:{id:string;label:string;fields:Field[]}[] }
export interface Driver {
  connect():Promise<void>; identify():Promise<string|null>; capabilities():Capability; sample():Promise<Sample>;
  auto():Promise<void>; manual(percent:number,seconds:number):Promise<void>; close():Promise<void>
}
export interface Plugin { manifest:Manifest; create(mode:string,config:Record<string,unknown>):Driver }
export const instanceSchema = z.object({ name:z.string().trim().min(1).max(100), plugin:z.string().min(1), transport:z.string().min(1), config:z.record(z.unknown()), mode:z.enum(['AUTO','MONITOR','DRY_RUN','ADAPTIVE']).default('MONITOR'), enabled:z.boolean().default(true), policy:policySchema.default(defaultPolicy) })
export type Instance = z.infer<typeof instanceSchema> & {id:string}
