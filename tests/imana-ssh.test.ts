import {test,expect} from 'bun:test'
import {imanaPrompt,sshFailure} from '../server/drivers/imana-ssh-errors'
test('actual iMana prompt and safe SSH diagnostics',()=>{
 expect(imanaPrompt('Last login: today\r\n\r\niMana:/->')).toBe(true)
 expect(imanaPrompt('iMana:/->ipmcget -d version\r\nIPMI Version: 2.0\r\n')).toBe(false)
 expect(imanaPrompt('Usage: ipmcset -v <value>')).toBe(false)
 expect(sshFailure(new Error('Handshake failed: no matching key exchange algorithm')).code).toBe('handshake')
 expect(sshFailure(new Error('All configured authentication methods failed')).code).toBe('authentication')
 expect(sshFailure(new Error('secret text'),true).code).toBe('fingerprint')
 expect(sshFailure(new Error('secret text')).message).not.toContain('secret')
})
