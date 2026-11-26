import {test,expect} from 'bun:test'
import {compareVersions,selectRelease,checksumFor,downloadRelease,checkRelease} from '../server/core/releases'
import {binaryAsset,dockerAsset,type UpdateRelease} from '../shared/release'
import {createHash} from 'node:crypto'
import {mkdtemp,readFile,rm,readdir} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
const data='example binary',sha=createHash('sha256').update(data).digest('hex')
const asset=(name:string,size:number)=>({name,size,state:'uploaded'})
const release=(tag:string,pre=true,draft=false)=>({tag_name:tag,prerelease:pre,draft,published_at:'2026-11-26T00:00:00Z',body:'test',assets:[asset(binaryAsset,data.length),asset(dockerAsset,data.length),asset('SHA256SUMS',100)]})
test('semver, channels, draft and no downgrade',()=>{
 expect(compareVersions('v0.3.0-alpha.10','0.3.0-alpha.2')).toBe(1)
 expect(compareVersions('0.3.0','0.3.0-rc.1')).toBe(1)
 const all=[release('v0.3.0-alpha.10'),release('v0.3.0',false),release('v9.0.0',false,true),release('v0.4.0-alpha.1')]
 expect(selectRelease(all,'preview','binary','0.3.0-alpha.2')?.tag).toBe('v0.4.0-alpha.1')
 expect(selectRelease(all,'stable','docker','0.3.0-alpha.2')?.asset).toBe(dockerAsset)
 expect(selectRelease(all,'stable','binary','0.4.0')).toBeNull()
 expect(selectRelease([{...all[0],assets:[]}],'preview','binary','0.3.0-alpha.2')).toBeNull()
 expect(()=>checksumFor(sha+'  '+binaryAsset+'\n'+sha+'  '+binaryAsset,binaryAsset)).toThrow()
})
test('bounded download, checksum verification and failed asset cleanup',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'hsfc-updates-'))
 const target=selectRelease([release('v0.4.0-alpha.1')],'preview','binary','0.3.0-alpha.2') as UpdateRelease
 const fake=(async(input:RequestInfo|URL)=>new Response(String(input).endsWith('SHA256SUMS')?sha+'  '+binaryAsset+'\n':data)) as typeof fetch
 try{
  const result=await downloadRelease(target,dir,()=>{},fake)
  expect(await readFile(result.file,'utf8')).toBe(data)
  const bad=(async(input:RequestInfo|URL)=>new Response(String(input).endsWith('SHA256SUMS')?'0'.repeat(64)+'  '+binaryAsset+'\n':data)) as typeof fetch
  await expect(downloadRelease(target,dir,()=>{},bad)).rejects.toThrow('SHA-256 mismatch')
  expect((await readdir(dir)).filter(x=>x.startsWith('.download-'))).toEqual([])
  const redirect=(async()=>new Response(null,{status:302,headers:{location:'https://example.org/malicious'}})) as unknown as typeof fetch
  await expect(checkRelease('preview','binary',redirect)).rejects.toThrow('Untrusted release URL')
 }finally{await rm(dir,{recursive:true,force:true})}
})
