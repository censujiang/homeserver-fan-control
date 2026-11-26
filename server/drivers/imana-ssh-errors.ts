import {createHash,timingSafeEqual} from 'node:crypto'
export class ImanaSSHError extends Error{
 constructor(readonly code:string,message:string){super(message);this.name='ImanaSSHError'}
}
export function sshFailure(error:unknown,mismatch=false,detail?:{actual:string;pins:string[]}){
 const e=error as {message?:string;code?:string;level?:string}
 const m=String(e?.message??'')
 if(mismatch||/host key.*verif|host denied/i.test(m))return new ImanaSSHError('fingerprint','SSH host key fingerprint mismatch; verify the BMC key'+(detail?'. Received: '+detail.actual+'; configured: '+detail.pins.join(', '):''))
 if(/no matching|no mutual|handshake failed|signature verification/i.test(m))return new ImanaSSHError('handshake','SSH handshake/algorithm negotiation failed; check the legacy BMC SSH algorithms')
 if(e?.level==='client-authentication'||/all configured authentication methods failed|authentication failed/i.test(m))return new ImanaSSHError('authentication','SSH authentication failed; verify the BMC account, password/key and permissions')
 if(e?.code==='ECONNREFUSED')return new ImanaSSHError('refused','SSH TCP connection refused; check BMC SSH service and port')
 if(['EHOSTUNREACH','ENETUNREACH','ENOTFOUND','EAI_AGAIN'].includes(e?.code??''))return new ImanaSSHError('network','SSH BMC address unreachable or DNS lookup failed')
 if(e?.code==='ETIMEDOUT'||/timed out|timeout/i.test(m))return new ImanaSSHError('timeout','SSH connection or handshake timed out')
 return new ImanaSSHError('connection','SSH connection failed before command completion')
}
export function imanaPrompt(text:string){return /(?:^|[\r\n])\s*iMana:[^\r\n]{0,80}>\s*$/i.test(text)}

export function parseHostPins(value:string){
 const pins=value.trim().split(/[\s,;]+/).map(s=>s.replace(/=$/,''))
 if(pins.length<1||pins.length>8||pins.some(s=>!/^SHA256:[A-Za-z0-9+/]{43}$/.test(s)))throw new Error('Invalid SHA256 host key fingerprints')
 return [...new Set(pins)]
}
export function hostPinMatches(key:Buffer,value:string){
 const actual='SHA256:'+createHash('sha256').update(key).digest('base64').replace(/=+$/,'')
 const pins=parseHostPins(value)
 const ok=pins.some(p=>timingSafeEqual(Buffer.from(p),Buffer.from(actual)))
 return {actual,pins,ok}
}
