import {test,expect} from 'bun:test'
import {parseArgs} from '../scripts/cli'
test('default, environment and explicit CLI precedence',()=>{
 expect(parseArgs([])).toEqual({help:false,host:'127.0.0.1',port:3000,dataDir:'./data',allowRemoteSetup:false})
 expect(parseArgs([],{PORT:'8080',NITRO_PORT:'8081'}).port).toBe(8081)
 expect(parseArgs(['--port=9000','-H','0.0.0.0','--data-dir','/var/lib/hsfc'],{NITRO_PORT:'8081'})).toEqual({help:false,host:'0.0.0.0',port:9000,dataDir:'/var/lib/hsfc',allowRemoteSetup:false})
})
test('short flags, help and invalid options',()=>{
 expect(parseArgs(['-p','8080']).port).toBe(8080)
 expect(parseArgs(['--help']).help).toBe(true)
 for(const args of [['--port','0'],['--port','65536'],['--port','abc'],['--port'],['--unknown'],['--host=']])expect(()=>parseArgs(args)).toThrow()
})

test('explicit remote setup opt-in',()=>{expect(parseArgs(['--allow-remote-setup']).allowRemoteSetup).toBe(true);expect(parseArgs([],{HSFC_ALLOW_REMOTE_SETUP:'1'}).allowRemoteSetup).toBe(true)})
