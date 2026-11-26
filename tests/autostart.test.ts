import {test,expect} from 'bun:test'
import {renderUnit,unitName,persistentState,shellQuote,renderSetupScript} from '../server/core/autostart'
test('systemd persistent enablement and linger',()=>{
 expect(persistentState('enabled')).toBe('enabled')
 expect(persistentState('enabled',false)).toBe('disabled')
 expect(persistentState('enabled-runtime')).toBe('disabled')
 expect(persistentState('static')).toBe('unknown')
 expect(persistentState('enabled',true)).toBe('enabled')
})
test('unit contains explicit launch paths and safe quoting',()=>{
 const s=renderUnit({exe:'/home/a/my app',args:['--port','8080','--data-dir','/data/a%foo/$HOME'],cwd:'/home/a/work',data:'/data/a%foo/$HOME'})
 expect(s).toContain('ExecStart="/home/a/my app" "--port" "8080"')
 expect(s).toContain('/data/a%%foo/$$HOME')
 expect(s).toContain('WantedBy=default.target')
 expect(()=>renderUnit({exe:'/bin/x\nExecStart=/bin/y',args:[],cwd:'/tmp',data:'/tmp'})).toThrow()
 expect(unitName('/a')).not.toBe(unitName('/b'))
 expect(shellQuote("a'b")).toBe("'a'\\''b'")
})

test('root setup script preserves paths, is not auto-starting, and refuses conflicts',()=>{
 const script=renderSetupScript({exe:'/root/app with space',args:['--port','9001','--data-dir','/root/data'],cwd:'/root',data:'/root/data'},0)
 expect(script).toContain('User=root')
 expect(script).toContain('WantedBy=multi-user.target')
 expect(script).toContain('refusing overwrite')
 expect(script).toContain('No new process was started.')
 expect(script).toContain('"9001"')
 expect(script).not.toContain('\nsudo ')
 const p=Bun.spawnSync(['/bin/sh','-n'],{stdin:Buffer.from(script)});expect(p.exitCode).toBe(0)
})
