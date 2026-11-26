import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, open, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { currentVersion, repository, releasePage, binaryAsset, dockerAsset, type Channel, type Deployment, type UpdateRelease } from '../../shared/release'
const versionPattern=/^v?(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/
function parse(v:string){const m=versionPattern.exec(v);if(!m||m[4]?.split('.').some(x=>/^0\d+$/.test(x)))return null;return {core:[Number(m[1]),Number(m[2]),Number(m[3])],pre:m[4]?.split('.')??[]}}
export function compareVersions(a:string,b:string){
 const x=parse(a),y=parse(b);if(!x||!y)throw new Error('Invalid semantic version')
 for(let i=0;i<3;i++){const d=x.core[i]!-y.core[i]!;if(d)return Math.sign(d)}
 if(!x.pre.length||!y.pre.length)return Number(!x.pre.length)-Number(!y.pre.length)
 for(let i=0;i<Math.max(x.pre.length,y.pre.length);i++){
  const p=x.pre[i],q=y.pre[i];if(p===q)continue;if(p===undefined)return -1;if(q===undefined)return 1
  const pn=/^\d+$/.test(p),qn=/^\d+$/.test(q)
  if(pn&&qn)return p.length!==q.length?Math.sign(p.length-q.length):p<q?-1:1
  if(pn!==qn)return pn?-1:1
  return p<q?-1:1
 }
 return 0
}
export const deployment=():Deployment=>process.env.HSFC_DEPLOYMENT==='docker'?'docker':process.env.HSFC_DEPLOYMENT==='binary'?'binary':'source'
export const defaultChannel:Channel=currentVersion.includes('-')?'preview':'stable'
export const assetFor=(mode:Deployment)=>mode==='docker'?dockerAsset:binaryAsset
type Fetcher=typeof fetch
const allowedHosts=new Set(['api.github.com','github.com','release-assets.githubusercontent.com','objects.githubusercontent.com'])
async function request(url:string,signal:AbortSignal,fetcher:Fetcher=fetch){
 for(let i=0;i<5;i++){
  const u=new URL(url);if(u.protocol!=='https:'||!allowedHosts.has(u.hostname)||u.port||u.username||u.password)throw new Error('Untrusted release URL')
  const r=await fetcher(url,{signal,redirect:'manual',headers:{'User-Agent':'HomeServer-Fan-Control/'+currentVersion,Accept:u.hostname==='api.github.com'?'application/vnd.github+json':'application/octet-stream'}})
  if([301,302,303,307,308].includes(r.status)){const next=r.headers.get('location');await r.body?.cancel();if(!next)throw new Error('Missing redirect');url=new URL(next,url).href;continue}
  if(!r.ok){await r.body?.cancel();throw new Error('GitHub HTTP '+r.status)}
  return r
 }
 throw new Error('Too many redirects')
}
async function boundedText(r:Response,max:number){
 if(!r.body)throw new Error('Empty response')
 const reader=r.body.getReader(),chunks:Uint8Array[]=[];let size=0
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>max)throw new Error('Response too large');chunks.push(value)}
 return Buffer.concat(chunks).toString('utf8')
 }finally{await reader.cancel().catch(()=>{})}
}
type GithubAsset={name?:string;size?:number;state?:string}
type GithubRelease={tag_name?:string;draft?:boolean;prerelease?:boolean;published_at?:string;body?:string;assets?:GithubAsset[]}
export function selectRelease(raw:unknown,channel:Channel,mode:Deployment,version=currentVersion):UpdateRelease|null{
 if(!Array.isArray(raw))throw new Error('Invalid GitHub release list')
 const name=assetFor(mode),candidates:UpdateRelease[]=[]
 for(const item of raw){
  if(!item||typeof item!=='object')continue
  const r=item as GithubRelease,t=r.tag_name
  if(typeof t!=='string'||!t.startsWith('v')||!parse(t)||r.draft!==false||typeof r.prerelease!=='boolean'||typeof r.published_at!=='string'||!Array.isArray(r.assets))continue
  const pre=r.prerelease||Boolean(parse(t)!.pre.length)
  if(channel==='stable'&&pre)continue
  if(compareVersions(t,version)<=0)continue
  const asset=r.assets.find(a=>a?.name===name&&a.state==='uploaded'&&Number.isSafeInteger(a.size)&&a.size!>0&&a.size!<=256*1024*1024)
  if(!asset||!r.assets.some(a=>a?.name==='SHA256SUMS'&&a.state==='uploaded'&&Number.isSafeInteger(a.size)&&a.size!>0&&a.size!<=65536))continue
  candidates.push({version:t.slice(1),tag:t,url:releasePage+'/tag/'+t,prerelease:pre,published:r.published_at,notes:typeof r.body==='string'?r.body.slice(0,20000):'',asset:name,size:asset.size!})
 }
 return candidates.sort((a,b)=>compareVersions(b.version,a.version))[0]??null
}
export async function checkRelease(channel:Channel,mode:Deployment,fetcher:Fetcher=fetch,version=currentVersion){
 const r=await request('https://api.github.com/repos/'+repository+'/releases?per_page=100',AbortSignal.timeout(15000),fetcher)
 return selectRelease(JSON.parse(await boundedText(r,8*1024*1024)),channel,mode,version)
}
export function checksumFor(text:string,name:string){
 const rows=text.split(/\r?\n/).map(line=>/^([0-9a-fA-F]{64}) [ *]([^\r\n]+)$/.exec(line)).filter(m=>m?.[2]===name)
 if(rows.length!==1)throw new Error('Missing or ambiguous SHA-256 checksum')
 return rows[0]![1]!.toLowerCase()
}
export async function downloadRelease(release:UpdateRelease,dir:string,onProgress:(bytes:number)=>void=()=>{},fetcher:Fetcher=fetch){
 if(!release.tag.startsWith('v')||!parse(release.tag)||!([binaryAsset,dockerAsset] as string[]).includes(release.asset)||!Number.isSafeInteger(release.size)||release.size<1||release.size>256*1024*1024)throw new Error('Invalid release asset')
 const base=releasePage+'/download/'+release.tag+'/'
 const signal=AbortSignal.timeout(180000)
 const expected=checksumFor(await boundedText(await request(base+'SHA256SUMS',signal,fetcher),65536),release.asset)
 await mkdir(dir,{recursive:true,mode:0o700})
 const temp=await mkdtemp(join(dir,'.download-'))
 try{
  const file=join(temp,release.asset),r=await request(base+release.asset,signal,fetcher)
  if(!r.body)throw new Error('Empty binary response')
  const reader=r.body.getReader(),out=await open(file,'wx',0o600),hash=createHash('sha256');let size=0
  try{
   for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>release.size)throw new Error('Asset exceeds declared size');hash.update(value);let offset=0;while(offset<value.byteLength){const w=await out.write(value,offset,value.byteLength-offset);if(!w.bytesWritten)throw new Error('Short write');offset+=w.bytesWritten}onProgress(size)}
   if(size!==release.size||hash.digest('hex')!==expected)throw new Error('Asset size or SHA-256 mismatch')
   await out.sync()
  }finally{await reader.cancel().catch(()=>{});await out.close()}
  const destination=join(dir,release.tag+'-'+release.asset)
  await rename(file,destination)
  await writeFile(destination+'.sha256',expected+'  '+release.asset+'\n',{mode:0o600})
  return {file:destination,sha256:expected}
 }finally{await rm(temp,{recursive:true,force:true})}
}
