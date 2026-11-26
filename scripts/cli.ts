export const help = `HomeServer Fan Control
Usage: homeserver-fan-control [options]
  -p, --port <1-65535>   HTTP listen port (default 3000)
  -H, --host <address>   Listen address (default 127.0.0.1)
      --data-dir <path>  Persistent data directory (default ./data)
      --allow-remote-setup  Allow password-only first setup on a trusted network (temporary)
  -h, --help            Show help
      --version         Show installed version
      --autostart-status [options]   Inspect boot startup
      --enable-autostart [options]  Enable user systemd service (no immediate start)
      --check-update [--stable|--preview]  Check GitHub releases
      --update [--stable|--preview]        Replace standalone executable (stop service first)
CLI options override NITRO_PORT/PORT, NITRO_HOST/HOST and HSFC_DATA_DIR.
`
export function parseArgs(args:string[],env:Record<string,string|undefined>={}){
 let host=env.NITRO_HOST??env.HOST??'127.0.0.1',port=env.NITRO_PORT??env.PORT??'3000',dataDir=env.HSFC_DATA_DIR??'./data',allowRemoteSetup=env.HSFC_ALLOW_REMOTE_SETUP==='1'
 if(args.includes('--help')||args.includes('-h'))return {help:true,host,port:3000,dataDir,allowRemoteSetup}
 for(let i=0;i<args.length;i++){
  const arg=args[i]!,eq=arg.indexOf('='),flag=eq<0?arg:arg.slice(0,eq)
  if(arg==='--allow-remote-setup'){allowRemoteSetup=true;continue}
  if(!['-p','--port','-H','--host','--data-dir'].includes(flag))throw new Error('Unknown option: '+flag)
  const value=eq<0?args[++i]:arg.slice(eq+1)
  if(!value||value.startsWith('-'))throw new Error('Missing value: '+flag)
  if(flag==='-p'||flag==='--port')port=value
  else if(flag==='-H'||flag==='--host')host=value
  else dataDir=value
 }
 if(!/^\d+$/.test(port)||Number(port)<1||Number(port)>65535)throw new Error('Port must be an integer from 1 to 65535')
 if(!host.trim()||/\s/.test(host))throw new Error('Invalid listen address')
 if(!dataDir.trim())throw new Error('Invalid data directory')
 return {help:false,host,port:Number(port),dataDir,allowRemoteSetup}
}
