import { imana } from '../drivers/imana'
import { mock } from '../drivers/mock'
import type { Plugin } from '../../shared/model'
export const plugins=new Map<string,Plugin>([imana,mock].map(p=>[p.manifest.id,p]))
