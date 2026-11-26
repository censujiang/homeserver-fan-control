import {test,expect} from 'bun:test'
import {imanaPrompt,sshFailure,parseHostPins,hostPinMatches} from '../server/drivers/imana-ssh-errors'
test('actual iMana prompt and safe SSH diagnostics',()=>{
 expect(imanaPrompt('Last login: today\r\n\r\niMana:/->')).toBe(true)
 expect(imanaPrompt('iMana:/->ipmcget -d version\r\nIPMI Version: 2.0\r\n')).toBe(false)
 expect(imanaPrompt('Usage: ipmcset -v <value>')).toBe(false)
 expect(sshFailure(new Error('Handshake failed: no matching key exchange algorithm')).code).toBe('handshake')
 expect(sshFailure(new Error('All configured authentication methods failed')).code).toBe('authentication')
 expect(sshFailure(new Error('secret text'),true).code).toBe('fingerprint')
 expect(sshFailure(new Error('secret text')).message).not.toContain('secret')
})

import {createHash} from 'node:crypto'
test('multiple verified host pins and observed mismatch diagnostics',()=>{
 const key=Buffer.from('synthetic public key'),pin='SHA256:'+createHash('sha256').update(key).digest('base64').replace(/=+$/,'')
 const other='SHA256:'+'A'.repeat(43)
 expect(parseHostPins(other+', '+pin+'=')).toEqual([other,pin])
 expect(hostPinMatches(key,other+', '+pin).ok).toBe(true)
 const bad=hostPinMatches(key,other);expect(bad.ok).toBe(false)
 expect(sshFailure(new Error('hidden'),true,bad).message).toContain(pin)
 expect(()=>parseHostPins('anything')).toThrow()
})
