// Set safe defaults before Nitro evaluates its startup module.
if(process.argv.includes('--plugin-worker')){
 // This entry is only launched by the sandboxed plugin runner. Never launch it with untrusted code outside the sandbox.
 const {existsSync}=await import('node:fs')
 if(!existsSync('/plugin/index.mjs')||process.getuid?.()===0)throw new Error('Invalid worker environment')
 const path='/plugin/index.mjs'
 const plugin=await import(path)
 const input=JSON.parse(await Bun.stdin.text())
 const result=await plugin.sample(input.mode,input.config)
 process.stdout.write(JSON.stringify(result))
}else if(['--update','--check-update'].includes(process.argv[2]??'')){
 const {updateCli}=await import('./update')
 try{await updateCli(process.argv.slice(2),Bun.main.includes('/$bunfs/')||import.meta.path.includes('/$bunfs/'))}catch(e){console.error((e as Error).message);process.exitCode=1}
}else if(process.argv[2]==='--version'){
 const {currentVersion}=await import('../shared/release');console.log(currentVersion)
}else{
 if(process.env.HSFC_DEPLOYMENT!=='docker')process.env.HSFC_DEPLOYMENT=Bun.main.includes('/$bunfs/')||import.meta.path.includes('/$bunfs/')?'binary':'source'
 if(process.env.HSFC_DEPLOYMENT==='source'){
  const {resolve}=await import('node:path')
  process.env.HSFC_STARTUP_ENTRY=resolve(process.argv[1]??'scripts/entry.ts')
 }
 const serving=process.argv[2]==='--serve'
 const startupAction=['--enable-autostart','--autostart-status','--generate-autostart-script'].includes(process.argv[2]??'')?process.argv[2]:undefined
 const {parseArgs,help}=await import('./cli')
 try{
  const cfg=parseArgs(process.argv.slice(startupAction||serving?3:2),process.env)
  if(cfg.help){console.log(help);process.exit(0)}
  process.env.NITRO_HOST=cfg.host
  process.env.NITRO_PORT=String(cfg.port)
  process.env.HSFC_DATA_DIR=cfg.dataDir
  process.env.HSFC_ALLOW_REMOTE_SETUP=cfg.allowRemoteSetup?'1':'0'
 }catch(e){console.error((e as Error).message);console.error(help);process.exit(2)}
 if(startupAction){
  const {autostartStatus,enableAutostart,generateAutostartScript}=await import('../server/core/autostart')
  try{
   if(startupAction==='--generate-autostart-script'){
    const path=await generateAutostartScript();if(!path)throw new Error('Autostart script unavailable for this deployment')
    console.log(path)
   }else{
   const s=startupAction==='--enable-autostart'?await enableAutostart():await autostartStatus()
   console.log(JSON.stringify(s,null,2))
   if(startupAction==='--enable-autostart'&&s.state!=='enabled')process.exitCode=1
   }
  }catch(e){console.error((e as Error).message);process.exitCode=1}
 }else if(!serving&&process.env.HSFC_DEPLOYMENT==='binary'&&process.platform==='linux'&&process.env.HSFC_NO_SUPERVISOR!=='1'){
  const {supervise}=await import('./supervisor')
  await supervise()
 }else{
  try{
   const {generateAutostartScript}=await import('../server/core/autostart')
   const path=await generateAutostartScript();if(path)console.log('Autostart setup script: '+path)
  }catch(e){console.warn('Autostart script not generated: '+(e as Error).message)}
  // @ts-expect-error Nitro output is generated during production build.
  await import('../.output/server/index.mjs')
 }
}
