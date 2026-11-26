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
}else{
 const {parseArgs,help}=await import('./cli')
 try{
  const cfg=parseArgs(process.argv.slice(2),process.env)
  if(cfg.help){console.log(help);process.exit(0)}
  process.env.NITRO_HOST=cfg.host
  process.env.NITRO_PORT=String(cfg.port)
  process.env.HSFC_DATA_DIR=cfg.dataDir
 }catch(e){console.error((e as Error).message);console.error(help);process.exit(2)}
 // @ts-expect-error Nitro output is generated during production build.
 await import('../.output/server/index.mjs')
}
