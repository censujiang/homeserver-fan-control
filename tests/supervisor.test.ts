import {test,expect} from 'bun:test'
import {validRequest,verifiedCandidate} from '../scripts/supervisor'
import {mkdtemp,writeFile,rm,symlink} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createHash} from 'node:crypto'
test('verified install request rejects downgrade, path injection and tampering',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'hsfc-install-'))
 try{
  const data='candidate',path=join(dir,'app'),r={tag:'v0.4.0-alpha.1',size:data.length,sha256:createHash('sha256').update(data).digest('hex')}
  expect(validRequest(r,'0.3.0')).toBe(true)
  expect(validRequest({...r,tag:'../app'},'0.3.0')).toBe(false)
  expect(validRequest(r,'0.5.0')).toBe(false)
  await writeFile(path,data,{mode:0o600});await verifiedCandidate(path,r)
  await expect(verifiedCandidate(path,{...r,sha256:'0'.repeat(64)})).rejects.toThrow()
  await symlink(path,join(dir,'link'));await expect(verifiedCandidate(join(dir,'link'),r)).rejects.toThrow()
 }finally{await rm(dir,{recursive:true,force:true})}
})
