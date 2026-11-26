<script setup lang="ts">
import type { AutostartStatus } from './shared/autostart'
import { type UpdateStatus, type Channel, releasePage } from './shared/release'
import { defaultPolicy, policySchema, type Manifest, type Instance, type Policy } from './shared/model'
type PublicInstance=Omit<Instance,'config'> & {configuredFields:string[];live:{online:boolean;error?:string;sample?:{at:number;identity:string|null;health:string;fanMode?:string;fanLevel?:number;leaseRemaining?:number;sensors:{id:string;name:string;kind:string;value:number|null;unit:string;health:string;raw?:string;valid?:boolean}[]};capability?:{reason:string;write:boolean;timedFallback:boolean};decision?:{target:number|null;reason:string}}}
type Dashboard={plugins:Manifest[];instances:PublicInstance[];events:{id:number;at:number;message:string;instance:string|null}[]}
const token=ref(''), password=ref(''), confirmPassword=ref(''), needsSetup=ref(false), setupAllowed=ref(false), error=ref(''), busy=ref(false), dash=ref<Dashboard>(), tab=ref('monitor'), dark=ref(false), lang=ref('zh')
const text=(zh:string,en:string)=>lang.value==='zh'?zh:en
const guide='https://github.com/censujiang/homeserver-fan-control/blob/master/'
const sensorGroups=[{id:'temperature',zh:'温度',en:'Temperature',kinds:['temperature','thermal-margin']},{id:'rpm',zh:'风扇转速',en:'Fan speeds',kinds:['rpm','percent']},{id:'power',zh:'功耗',en:'Power',kinds:['power']},{id:'discrete',zh:'设备状态（原始事件位）',en:'Device state (raw event bits)',kinds:['discrete']}]
const sensorFilter=ref(''),showRaw=ref(false),showEditor=ref(false),advancedPolicy=ref(false)
const policyDraft=ref<Policy>(structuredClone(defaultPolicy))
const modesHelp:Record<string,[string,string]>={AUTO:['维持原厂自动散热；不主动调速。','Keep factory automatic cooling; no active speed changes.'],MONITOR:['推荐：只采集真实传感器，不改变风扇。','Recommended: collect real sensors without changing fans.'],DRY_RUN:['仅计算模拟目标，不写入硬件。','Calculate a simulated target without hardware writes.'],ADAPTIVE:['Mock 可模拟；iMana 200 SSH 实验控制需显式开启并满足安全条件。','Mock simulation or explicitly enabled experimental iMana SSH control, subject to safety checks.']}
const modeHelp=(mode:string)=>{const m=modesHelp[mode];return m?text(m[0],m[1]):mode}
const healthLabel=(h:string)=>h==='ok'?text('正常','OK'):h==='fault'?text('异常','Fault'):text('未判定','Unknown')
function shownSensors(i:PublicInstance,kinds:string[]){const q=sensorFilter.value.trim().toLowerCase();return (i.live.sample?.sensors??[]).filter(s=>kinds.includes(s.kind)&&(!q||s.name.toLowerCase().includes(q)))}
function sensorValue(s:{kind:string;value:number|null}){return s.value===null?'—':s.kind==='discrete'?'0x'+s.value.toString(16).toUpperCase():String(s.value)}
const form=reactive({id:'',name:'',plugin:'mock',transport:'mock',mode:'MONITOR',enabled:true,config:{} as Record<string,unknown>,policy:JSON.stringify(defaultPolicy,null,2)})
const updateWaiting=ref(''), updateOutcome=ref(''), updateDeadline=ref(0)
const update=ref<UpdateStatus>(), channel=ref<Channel>('preview'), updateBusy=ref(false), updateError=ref('')
async function refreshUpdate(){
 if(updateWaiting.value){
  if(token.value)try{update.value=await $fetch<UpdateStatus>('/api/update/status',{headers:auth(),timeout:2500})}catch{/* restarting */}
  try{const s=await $fetch<{version?:string;updateResult?:{tag:string;status:string}}>('/api/auth/status',{timeout:2500})
   if(s.updateResult?.tag===updateWaiting.value&&['success','failed','rolled-back'].includes(s.updateResult.status)){
    sessionStorage.setItem('updateOutcome',s.updateResult.status);sessionStorage.removeItem('updateWaiting');sessionStorage.removeItem('updateDeadline');sessionStorage.removeItem('token');location.reload();return
   }
  }catch{/* expected disconnect during restart */}
  if(Date.now()>updateDeadline.value){updateWaiting.value='';sessionStorage.removeItem('updateWaiting');sessionStorage.removeItem('updateDeadline');updateError.value=text('等待重启超时，请检查服务器日志。','Restart timed out; inspect server logs.')}
  return
 }
 if(!token.value||tab.value!=='updates')return;try{update.value=await $fetch<UpdateStatus>('/api/update/status',{headers:auth()})}catch{updateError.value=text('读取更新状态失败','Could not load update status')}}
async function installUpdate(download=false){
 const tag=update.value?.latest?.tag
 if(!tag||!confirm(text('下载、校验并安装新版本，然后自动重启？请先停止真实硬件 ADAPTIVE 控制。','Download, verify, install and restart automatically? Stop physical ADAPTIVE control first.')))return
 updateBusy.value=true;updateError.value=''
 try{
  await $fetch(download?'/api/update/download':'/api/update/install',{method:'POST',headers:auth(),body:{tag,...(download?{autoInstall:true}:{})}})
  updateWaiting.value=tag;updateDeadline.value=Date.now()+420000;sessionStorage.setItem('updateWaiting',tag);sessionStorage.setItem('updateDeadline',String(updateDeadline.value))
 }catch(e){updateError.value=(e as Error).message}
 finally{updateBusy.value=false}
}
async function updateAction(check:boolean){updateBusy.value=true;updateError.value='';try{
 if(check)update.value=await $fetch<UpdateStatus>('/api/update/check',{method:'POST',headers:auth(),body:{channel:channel.value}})
 else if(update.value?.latest)update.value=await $fetch<UpdateStatus>('/api/update/download',{method:'POST',headers:auth(),body:{tag:update.value.latest.tag}})
 }catch{updateError.value=text('更新操作失败，请检查 GitHub 连接或稍后重试。','Update failed; check GitHub connectivity or try again later.')}finally{updateBusy.value=false}}
watch(tab,async v=>{if(v==='updates'){await refreshUpdate();channel.value=update.value?.channel??'preview'}})
const startup=ref<AutostartStatus>(),startupBusy=ref(false),startupError=ref(''),startupCopied=ref(false)
const startupLabel=(s?:AutostartStatus)=>s?.state==='enabled'?text('已设置开机自启','Enabled at boot'):s?.state==='disabled'?text('未设置开机自启','Not enabled at boot'):text('开机自启状态未知','Boot startup unknown')
const startupReason=(s:AutostartStatus)=>{
 const reasons:Record<string,[string,string]>={
 docker_host_required:['容器无法可靠检测宿主机的 Docker 重启策略。请在宿主机设置。','The container cannot reliably inspect the host restart policy. Configure it on the Docker host.'],
 managed_enabled:['已确认当前 systemd 服务永久启用。','The current systemd service is persistently enabled.'],
 managed_not_confirmed:['当前服务的永久自启未确认，请检查服务启用状态及 linger。','Persistent startup is not confirmed; check service enablement and linger.'],
 enabled_next_boot:['服务已启用开机自启；当前程序继续运行，下次启动时生效。','Service is enabled for the next boot; the current process continues.'],
 not_detected:['未检测到本程序对应的用户 systemd 自启单元；其他启动管理器无法判断。','No matching user systemd boot unit detected; other startup managers cannot be verified.'],
 user_linger_or_enable_required:['用户服务尚未确认开机启动；需永久启用并开启 linger。','The user service needs persistent enablement and linger.'],
 user_manager_unavailable:['用户 systemd 管理器不可用，请在宿主机登录会话中执行命令。','The user systemd manager is unavailable; run the commands in a host login session.'],
 root_manual_required:['当前以 root 直接运行。执行本地生成的脚本可设置开机自启，保留当前权限；长期建议迁移至专用用户。','Running directly as root. Run the generated local script to enable startup with the current privileges; prefer a dedicated user long-term.'],
 systemd_unavailable:['未检测到 systemd，无法可靠设置自启。','systemd was not detected; automatic startup cannot be configured reliably.'],
 launch_unknown:['未识别受支持的生产启动入口，请使用发行二进制或 bun scripts/entry.ts。','Production launch entry not recognized; use the release executable or bun scripts/entry.ts.'],
 unit_conflict:['同名服务配置不匹配，不会自动覆盖。请在宿主机核查。','An existing unit differs; it will not be overwritten. Inspect it on the host.'],
 enable_failed:['启用失败，请复制命令在宿主机执行。','Enable failed; copy the commands and run them on the host.'],
 linger_or_permission_required:['服务启用或 linger 未确认，可能需要宿主机管理员授权。','Enablement or linger is unconfirmed; host administrator authorization may be required.']
 }
 const v=reasons[s.reason];return v?text(v[0],v[1]):s.reason
}
async function refreshStartup(){if(!token.value)return;startupBusy.value=true;startupError.value='';try{startup.value=await $fetch<AutostartStatus>('/api/autostart/status',{headers:auth()})}catch{startupError.value=text('检测失败，请重试。','Detection failed; please retry.')}finally{startupBusy.value=false}}
async function enableStartup(){if(!confirm(text('启用开机自启动？不会立即启动第二个实例或重启当前程序。','Enable boot startup? This will not start a second instance or restart the current process.')))return;startupBusy.value=true;startupError.value='';try{startup.value=await $fetch<AutostartStatus>('/api/autostart/enable',{method:'POST',headers:auth()})}catch{startupError.value=text('启用失败，请使用宿主机命令。','Enable failed; use host commands.')}finally{startupBusy.value=false}}
async function copyStartup(){const value=startup.value?.commands.join('\n')??'';startupCopied.value=false;try{await navigator.clipboard.writeText(value);startupCopied.value=true}catch{
 const area=document.createElement('textarea');area.value=value;area.style.position='fixed';area.style.opacity='0';document.body.appendChild(area);area.select();try{startupCopied.value=document.execCommand('copy')}finally{area.remove()}
 if(!startupCopied.value)startupError.value=text('浏览器不允许复制，请手动选中命令。','Clipboard unavailable; select the commands manually.')
}}
watch(token,v=>{if(v)void refreshStartup();else startup.value=undefined})
watch(tab,v=>{if(v==='startup')void refreshStartup()})
const installedPlugins=ref<Manifest[]>([])
const uploadFile=ref<File>()
async function listPlugins(){installedPlugins.value=await $fetch<Manifest[]>('/api/plugins',{headers:auth()})}
function chooseFile(e:Event){uploadFile.value=(e.target as HTMLInputElement).files?.[0]}
async function upload(){if(!uploadFile.value||!confirm(text('第三方插件是可执行代码。仅安装可信来源，默认禁用。继续？','Third-party plugins contain executable code. Install only trusted packages. Continue?')))return;await action(async()=>{await $fetch('/api/plugins',{method:'POST',headers:{...auth(),'Content-Type':'application/zip'},body:uploadFile.value});uploadFile.value=undefined;await listPlugins()})}
async function managePlugin(id:string,enabled:boolean){await action(async()=>{await $fetch('/api/plugins/'+id,{method:'PUT',headers:auth(),body:{enabled}});await refresh();await listPlugins()})}
async function uninstallPlugin(id:string){if(!confirm(text('卸载插件？','Uninstall plugin?')))return;await action(async()=>{await $fetch('/api/plugins/'+id,{method:'DELETE',headers:auth()});await listPlugins()})}
watch(tab,async v=>{if(v==='plugins')await action(listPlugins)})
const history=ref<{at:number;live:PublicInstance['live']}[]>([]), historyId=ref('')
const manifest=computed(()=>dash.value?.plugins.find(p=>p.id===form.plugin))
const fields=computed(()=>manifest.value?.modes.find(m=>m.id===form.transport)?.fields??[])
const auth=()=>({Authorization:'Bearer '+token.value})
async function refresh(){
 if(!token.value||updateWaiting.value)return
 try{dash.value=await $fetch<Dashboard>('/api/dashboard',{headers:auth()})}
 catch(e){if((e as {statusCode?:number}).statusCode===401){token.value='';sessionStorage.removeItem('token')}else error.value=text('读取失败','Refresh failed')}
}
async function action(f:()=>Promise<void>){busy.value=true;error.value='';try{await f()}catch(e){error.value=(e as Error).message}finally{busy.value=false}}
async function signIn(){await action(async()=>{
 if(needsSetup.value){
  if(!setupAllowed.value)throw new Error(text('请通过本机或 SSH 隧道访问，或在可信局域网启动时添加 --allow-remote-setup。','Use loopback/SSH tunnel, or explicitly opt in with --allow-remote-setup on a trusted network.'))
  if(password.value.length<12||password.value.length>128)throw new Error(text('管理员密码须为 12～128 个字符。','Administrator password must contain 12–128 characters.'))
  if(password.value!==confirmPassword.value)throw new Error(text('两次密码输入不一致。','Passwords do not match.'))
  try{await $fetch('/api/auth/setup',{method:'POST',body:{password:password.value}})}
  catch(e){const s=(e as {statusCode?:number}).statusCode;if(s===403)throw new Error(text('当前连接不允许初始化，请检查启动参数。','Setup is not allowed from this connection. Check launch options.'));if(s===409)throw new Error(text('管理员已初始化或初始化正在进行，请刷新。','Already initialized or in progress; refresh.'));throw e}
  needsSetup.value=false
 }
 const result=await $fetch<{token:string}>('/api/auth/login',{method:'POST',body:{password:password.value}})
 token.value=result.token;sessionStorage.setItem('token',token.value);password.value='';confirmPassword.value='';await refresh()
})}
async function signOut(){await $fetch('/api/auth/logout',{method:'POST',headers:auth()}).catch(()=>{});token.value='';sessionStorage.removeItem('token');dash.value=undefined}
function reset(){
 showEditor.value=true;advancedPolicy.value=false;form.id='';form.name='';form.plugin='mock';form.transport='mock';form.mode='MONITOR';form.enabled=true;form.config={};policyDraft.value=structuredClone(defaultPolicy);form.policy=JSON.stringify(policyDraft.value,null,2)
}
function selectPlugin(){form.transport=manifest.value?.modes[0]?.id??'';selectTransport()}
function selectTransport(){form.config=Object.fromEntries(fields.value.filter(f=>f.default!==undefined).map(f=>[f.key,f.default]))}
function edit(i:PublicInstance){showEditor.value=true;advancedPolicy.value=false;policyDraft.value=policySchema.parse(i.policy);form.id=i.id;form.name=i.name;form.plugin=i.plugin;form.transport=i.transport;form.mode=i.mode;form.enabled=i.enabled;form.config={};form.policy=JSON.stringify(i.policy,null,2);tab.value='servers'}
async function save(){if(form.mode==='ADAPTIVE'&&form.plugin!=='mock'&&!confirm(text('启用真实硬件实验调速？请确保现场有人监护，且已验证 BMC 30 秒回退。','Enable experimental physical fan control? Ensure supervised testing and verified 30-second BMC fallback.')))return;await action(async()=>{
 const body={name:form.name,plugin:form.plugin,transport:form.transport,mode:form.mode,enabled:form.enabled,policy:policySchema.parse(advancedPolicy.value?JSON.parse(form.policy):policyDraft.value),...(!form.id||Object.keys(form.config).length?{config:form.config}:{})}
 await $fetch(form.id?'/api/instances/'+form.id:'/api/instances',{method:form.id?'PUT':'POST',headers:auth(),body})
 reset();showEditor.value=false;await refresh()
})}
async function stopControl(i:PublicInstance){
 if(!confirm(text('停止自适应控制并尝试恢复原厂 AUTO？','Stop adaptive control and attempt to restore factory AUTO?')))return
 await action(async()=>{await $fetch('/api/instances/'+i.id,{method:'PUT',headers:auth(),body:{mode:'MONITOR'}});await refresh()})
}
async function remove(id:string){if(!confirm(text('删除此服务器配置？','Remove this server?')))return;await action(async()=>{await $fetch('/api/instances/'+id,{method:'DELETE',headers:auth()});await refresh()})}
async function readHistory(){if(!historyId.value)return;await action(async()=>{history.value=await $fetch('/api/history',{headers:auth(),query:{id:historyId.value,from:Date.now()-86400000}})})}
let timer:ReturnType<typeof setInterval>|undefined
onMounted(async()=>{updateWaiting.value=sessionStorage.getItem('updateWaiting')??'';updateDeadline.value=Number(sessionStorage.getItem('updateDeadline')??0);updateOutcome.value=sessionStorage.getItem('updateOutcome')??'';sessionStorage.removeItem('updateOutcome');reset();showEditor.value=false;token.value=sessionStorage.getItem('token')??'';dark.value=matchMedia('(prefers-color-scheme: dark)').matches;const s=await $fetch<{setup:boolean;allowed:boolean}>('/api/auth/status');needsSetup.value=s.setup;setupAllowed.value=s.allowed;await refresh();timer=setInterval(()=>{void refresh();void refreshUpdate()},5000)})
onBeforeUnmount(()=>clearInterval(timer))
</script>
<template>
 <main :class="{dark}">
  <header><div><small>HOMESERVER / CONTROL</small><h1>{{text('智能散热管理','Fan Control')}}</h1></div><div class="actions"><button @click="lang=lang==='zh'?'en':'zh'">{{lang==='zh'?'EN':'中文'}}</button><button @click="dark=!dark">{{dark?'☀':'☾'}}</button><button v-if="token" @click="signOut">{{text('退出','Sign out')}}</button></div></header>
  <div v-if="updateWaiting" role="status" class="warning">{{text('正在下载、校验或安装新版，服务恢复后页面会自动刷新。','Downloading, verifying or installing. This page will refresh when the service returns.')}}</div><div v-if="updateOutcome" role="status" class="warning">{{updateOutcome==='success'?text('更新完成，请重新登录。','Update complete; sign in again.'):text('更新未成功，请检查日志；若已替换程序，将尝试恢复旧版本。','Update unsuccessful. Check logs; rollback is attempted if the binary was replaced.')}}</div>
  <div v-if="error" role="alert" class="warning">{{error}}</div>
  <section v-if="!token" class="login">
   <h2>{{needsSetup?text('欢迎使用 · 创建管理员','Welcome · Create administrator'):text('管理员登录','Administrator login')}}</h2>
   <p v-if="needsSetup">{{text('首次使用只需设置管理员密码。初始化成功后立即登录，后续使用同一密码。','Set your administrator password on first use. Sign in immediately after setup; reuse this password later.')}}</p>
   <div v-if="needsSetup&&!setupAllowed" class="warning">{{text('当前远程连接不允许初始化。请用 SSH 隧道访问回环监听地址，或在受信任的局域网启动时添加 --allow-remote-setup。初始化之前请勿公开端口。','Remote setup is blocked. Use an SSH tunnel to a loopback listener or add --allow-remote-setup on a trusted LAN. Do not expose the port before setup.')}}</div>
   <form @submit.prevent="signIn"><label>{{text('管理员密码','Password')}}<input v-model="password" type="password" required :minlength="needsSetup?12:1" maxlength="128" :autocomplete="needsSetup?'new-password':'current-password'"><small v-if="needsSetup">{{text('12～128 个字符，不需要安装密钥。','12–128 characters; no setup key required.')}}</small></label>
    <label v-if="needsSetup">{{text('确认密码','Confirm password')}}<input v-model="confirmPassword" type="password" required autocomplete="new-password"></label>
    <button class="primary" :disabled="busy||(needsSetup&&!setupAllowed)">{{needsSetup?text('创建管理员并进入','Create administrator and enter'):text('登录','Sign in')}}</button>
   </form>
  </section>
  <template v-else>
   <nav><button v-for="[id,zh,en] in [['monitor','监控','Monitor'],['servers','服务器 / 策略','Servers / policies'],['plugins','插件','Plugins'],['history','历史','History'],['events','事件','Events'],['updates','软件更新','Updates'],['startup','启动管理','Startup']]" :key="id" :class="{active:tab===id}" @click="tab=id">{{text(zh,en)}}</button></nav>
   <p><button @click="tab='startup'" :class="startup?.state==='enabled'?'ok':'muted'">{{startupLabel(startup)}}</button></p>
   <p class="warning">{{text('安全提示：Local IPMI 仍只读；iMana 200 SSH 实验调速需显式启用，建议在现场监督下测试。','Safety: Local IPMI remains read-only. Experimental iMana SSH fan control requires opt-in and supervised testing.')}}</p>
   <section v-if="tab==='monitor'">
    <div class="line section-head"><div><h2>{{text('实时监控','Live monitoring')}}</h2><small>{{text('每 5 秒刷新 · 实际能力取决于连接及模式','Refreshes every 5 seconds · capabilities depend on transport and mode')}}</small></div><button class="primary" @click="reset();tab='servers'">{{text('+ 添加服务器','+ Add server')}}</button></div>
    <div class="toolbar"><input v-model="sensorFilter" :placeholder="text('搜索传感器名称','Search sensor name')"><label class="check"><input v-model="showRaw" type="checkbox">{{text('显示原始读数','Show raw readings')}}</label></div>
    <p v-if="!dash?.instances.length">{{text('尚未添加服务器。请点击添加服务器，选择硬件和连接方式。','No servers configured. Add a server and select its hardware and transport.')}}</p>
    <article v-for="i in dash?.instances" :key="i.id" class="server-card">
     <div class="line"><div><h3>{{i.name}}</h3><small>{{i.transport}} · {{i.mode}} · {{modeHelp(i.mode)}}</small></div><div class="actions"><span :class="i.live.online?'status-good':'status-muted'">{{i.live.online?text('在线','Online'):text('离线','Offline')}}</span><button v-if="i.mode==='ADAPTIVE'" class="fault" @click="stopControl(i)">{{text('停止控制 / AUTO','Stop control / AUTO')}}</button><button @click="edit(i)">{{text('配置','Configure')}}</button></div></div>
     <p v-if="i.live.error" class="warning">{{i.live.error}}</p>
     <p v-else class="muted">{{i.live.capability?.reason}} · {{i.live.capability?.write?text('支持实验写入','Experimental writes available'):text('只读','Read only')}}</p>
     <p v-if="i.live.sample"><small>{{text('采样时间','Sample time')}} {{new Date(i.live.sample.at).toLocaleString()}} · {{text('硬件健康','Hardware health')}} {{healthLabel(i.live.sample.health)}} · {{text('风扇目标','Fan target')}} {{i.live.sample.fanLevel===undefined?'—':i.live.sample.fanLevel+'%'}} · {{i.live.sample.fanMode??'—'}} <span v-if="i.live.sample.leaseRemaining!==undefined">· {{i.live.sample.leaseRemaining}}s</span></small></p>
     <p v-if="i.live.decision">{{i.mode==='ADAPTIVE'?text('策略目标','Policy target'):text('模拟目标','Simulated target')}} {{i.live.decision.target??'AUTO'}} · {{i.live.decision.reason}}</p>
     <template v-for="g in sensorGroups" :key="g.id">
      <details v-if="g.id==='discrete'&&shownSensors(i,g.kinds).length" :open="!!sensorFilter" class="sensor-group"><summary>{{text(g.zh,g.en)}} · {{shownSensors(i,g.kinds).length}}</summary><p class="muted">{{text('事件位需根据厂商 SDR 定义解释；十六进制数值本身不等于故障。','Event bitmaps require vendor SDR definitions; hexadecimal values alone do not indicate a fault.')}}</p><div class="state-list"><div v-for="s in shownSensors(i,g.kinds)" :key="s.id" class="state-row"><span>{{s.name}}</span><code>{{sensorValue(s)}}</code><small :class="s.health==='fault'?'fault':''">{{healthLabel(s.health)}}</small><small v-if="showRaw" class="raw">{{s.raw}}</small></div></div></details>
      <div v-else-if="g.id!=='discrete'&&shownSensors(i,g.kinds).length" class="sensor-group"><h4>{{text(g.zh,g.en)}}</h4><p v-if="g.id==='temperature'" class="muted">{{text('DTS 是相对热阈值的读数，不是实际 CPU 温度；负值通常表示仍有热裕量。','DTS is relative to a thermal threshold, not absolute CPU temperature; negative readings generally indicate remaining headroom.')}}</p><div class="sensors"><div v-for="s in shownSensors(i,g.kinds)" :key="s.id" class="sensor"><small>{{s.name}}</small><strong>{{sensorValue(s)}} <small>{{s.unit}}</small></strong><small :class="s.health==='fault'?'fault':s.health==='ok'?'ok':'muted'">{{healthLabel(s.health)}}</small><small v-if="showRaw" class="raw">{{s.raw}}</small></div></div></div>
     </template>
    </article>
   </section>
   <section v-if="tab==='servers'">
<div class="line section-head"><div><h2>{{text('服务器和温控策略','Servers and policies')}}</h2><small>{{text('先建立连接并验证监控，再设置模拟策略。','Connect and verify monitoring before tuning simulation.') }}</small></div><button class="primary" @click="reset()">{{text('+ 添加服务器','+ Add server')}}</button></div>
    <article v-for="i in dash?.instances" :key="i.id" class="line"><span>{{i.name}} · {{i.mode}}</span><div class="actions"><button @click="edit(i)">{{text('编辑','Edit')}}</button><button @click="remove(i.id)">{{text('删除','Delete')}}</button></div></article>
    <article v-if="showEditor"><div class="line"><h3>{{form.id?text('编辑配置','Edit configuration'):text('添加服务器','Add server')}}</h3><button @click="showEditor=false">{{text('关闭','Close')}}</button></div><form @submit.prevent="save">
      <h4>{{text('1. 硬件与连接','1. Hardware and connection')}}</h4><label>{{text('名称','Name')}}<input v-model="form.name" required></label>
      <label>{{text('硬件插件','Hardware plugin')}}<select v-model="form.plugin" @change="selectPlugin"><option v-for="p in dash?.plugins" :key="p.id" :value="p.id">{{p.name}}</option></select></label>
      <label>{{text('连接方式','Transport')}}<select v-model="form.transport" @change="selectTransport"><option v-for="m in manifest?.modes" :key="m.id" :value="m.id">{{m.label}}</option></select></label>
      <p class="help">{{form.transport==='local'?text('本机 IPMI：需要 /dev/ipmi0 和 ipmitool。适合直接运行在物理服务器上。','Local IPMI: requires /dev/ipmi0 and ipmitool; for the managed physical host.'):form.transport==='ssh'?text('SSH：填写 BMC 管理地址、用户名、密码或私钥，以及经核验的 SHA256 主机指纹。','SSH: BMC address, username, password or key, and verified SHA256 host fingerprint.'):text('模拟或外置插件：按插件说明填写。','Mock or external plugin: follow plugin documentation.')}} <a v-if="form.plugin==='huawei.imana200'" :href="guide+'docs/plugins/builtin/huawei-imana-200.md'" target="_blank" rel="noopener">{{text('接入指南','Connection guide')}}</a></p><p v-if="form.id">{{text('不填写连接参数则保留旧配置；如修改则完整填写。','Leave all connection fields empty to retain old config; otherwise enter complete config.')}}</p>
      <label v-for="f in fields" :key="f.key">{{f.label}}<input v-model="form.config[f.key]" :type="f.type" :placeholder="f.default===undefined?undefined:String(f.default)" :required="!form.id&&f.required"></label>
      <h4>{{text('2. 运行方式','2. Operating mode')}}</h4><label>{{text('运行模式','Mode')}}<select v-model="form.mode"><option>AUTO</option><option>MONITOR</option><option>DRY_RUN</option><option value="ADAPTIVE" :disabled="form.plugin!=='mock'&&!(form.plugin==='huawei.imana200'&&form.transport==='ssh')">ADAPTIVE</option></select><small>{{modeHelp(form.mode)}}</small></label><p v-if="form.plugin==='huawei.imana200'&&form.transport==='ssh'" class="help">{{text('实验控制：连接参数 Control 填 experimental，选择 ADAPTIVE；首次请先使用 DRY_RUN。强制保护 CPU1/2 DTS、进风温度与全部 8 个转子；仅 30–100%，30 秒硬件租约。更改现有连接参数时须完整填写。','Experimental: set Control to experimental and select ADAPTIVE; start with DRY_RUN. Mandatory protection of both DTS, inlet and all 8 rotors; 30–100%, 30-second hardware lease. Re-enter all connection fields when changing connection settings.')}}</p>
      <label class="check"><input v-model="form.enabled" type="checkbox">{{text('启用监控','Enable monitoring')}}</label>
      <details class="policy-box"><summary>{{text('3. 温控策略（可选）','3. Cooling policy (optional)')}}</summary>
       <p class="help">{{text('MONITOR 无需策略；DRY_RUN 仅模拟。iMana SSH ADAPTIVE 实验模式强制保护两颗 CPU DTS、进风及 8 个转子，最低 30%，最高保护目标 100%；额外阈值只能更保守。','MONITOR needs no policy; DRY_RUN only simulates. Experimental iMana SSH ADAPTIVE enforces both CPU DTS, inlet and 8 rotors, minimum 30%, protective maximum 100%; extra thresholds can only tighten protection.')}}</p>
       <label class="check"><input type="checkbox" :checked="advancedPolicy" @change="advancedPolicy=!advancedPolicy;if(advancedPolicy)form.policy=JSON.stringify(policyDraft,null,2);else{try{policyDraft=policySchema.parse(JSON.parse(form.policy))}catch{advancedPolicy=true;error=text('JSON 无效，无法切换。','Invalid JSON; cannot switch.')}}">{{text('高级 JSON 编辑','Advanced JSON editor')}}</label>
       <textarea v-if="advancedPolicy" v-model="form.policy" rows="12" spellcheck="false"></textarea>
       <template v-else>
        <div class="field-grid"><label>{{text('最低转速 (%)','Minimum speed (%)')}}<input v-model.number="policyDraft.min" type="number" min="1" max="100"></label><label>{{text('最高转速 (%)','Maximum speed (%)')}}<input v-model.number="policyDraft.max" type="number" min="1" max="100"></label><label>{{text('调整步长 (%)','Step (%)')}}<input v-model.number="policyDraft.step" type="number" min="1" max="20"></label><label>{{text('调整间隔 (秒)','Delay (seconds)')}}<input v-model.number="policyDraft.delay" type="number" min="60" max="3600"></label><label>{{text('滞回','Hysteresis')}}<input v-model.number="policyDraft.hysteresis" type="number" min="0" max="20" step="0.1"></label><label>{{text('预测','Prediction')}}<input v-model.number="policyDraft.prediction" type="number" min="0" max="30"></label></div>
        <label class="check"><input v-model="policyDraft.adaptive" type="checkbox">{{text('启用自适应策略','Enable adaptive policy')}}</label>
        <h4>{{text('传感器阈值','Sensor thresholds')}}</h4><p class="muted">{{text('填写已采集的传感器 ID，热阈值必须大于暖阈值。不要把 DTS 当成绝对温度。','Enter actual sensor IDs; hot must exceed warm. Do not treat DTS as absolute temperature.')}}</p>
        <div v-for="(s,n) in policyDraft.sensors" :key="n" class="field-grid"><label>ID<input v-model="s.id" :list="'sensor-options'"></label><label>{{text('暖','Warm')}}<input v-model.number="s.warm" type="number" step="any"></label><label>{{text('热','Hot')}}<input v-model.number="s.hot" type="number" step="any"></label><button type="button" @click="policyDraft.sensors.splice(n,1)">{{text('移除','Remove')}}</button></div>
        <datalist id="sensor-options"><option v-for="s in dash?.instances.find(i=>i.id===form.id)?.live.sample?.sensors.filter(s=>s.kind==='temperature'||s.kind==='thermal-margin')" :key="s.id" :value="s.id"/></datalist>
        <button type="button" @click="policyDraft.sensors.push({id:'',warm:40,hot:65})">{{text('+ 添加阈值','+ Add threshold')}}</button>
        <h4>{{text('风扇 ID','Fan IDs')}}</h4><div v-for="(f,n) in policyDraft.fans" :key="n" class="actions"><input v-model="policyDraft.fans[n]" :placeholder="f"><button type="button" @click="policyDraft.fans.splice(n,1)">{{text('移除','Remove')}}</button></div><button type="button" @click="policyDraft.fans.push('')">{{text('+ 添加风扇','+ Add fan')}}</button>
       </template>
      </details>
      <div class="actions"><button class="primary" :disabled="busy">{{text('保存配置','Save configuration')}}</button><button type="button" @click="reset">{{text('重置','Reset')}}</button></div>
    </form></article>
   </section>
   <section v-if="tab==='plugins'"><h2>{{text('内置插件','Built-in plugins')}}</h2><article v-for="p in dash?.plugins" :key="p.id"><h3>{{p.name}} <small>{{p.version}}</small></h3><p>{{p.description}}</p><p>{{p.modes.map(m=>m.label).join(' / ')}}</p></article><h2>{{text('外置插件（实验功能）','External plugins (experimental)')}}</h2><p><a :href="guide+'docs/plugins/external/quick-start.md'" target="_blank" rel="noopener">{{text('插件快速接入与开发指南','Plugin quick start and development guide')}}</a></p><p>{{text('安装不会执行代码。隔离执行需管理员在宿主机显式启用，尚待验证。','Installation does not execute code. Isolated execution requires host opt-in and remains unverified.')}}</p><input type="file" accept=".zip" @change="chooseFile"><button :disabled="busy||!uploadFile" @click="upload">{{text('上传 ZIP','Upload ZIP')}}</button><article v-for="p in installedPlugins" :key="p.id"><h3>{{p.name}} · {{p.version}}</h3><p>{{p.id}}</p><div class="actions"><button @click="managePlugin(p.id,true)">{{text('启用','Enable')}}</button><button @click="managePlugin(p.id,false)">{{text('禁用','Disable')}}</button><button @click="uninstallPlugin(p.id)">{{text('卸载','Uninstall')}}</button></div></article></section>
   <section v-if="tab==='history'"><h2>{{text('过去24小时采样','Last 24 hours')}}</h2><p class="help">{{text('选择服务器查询历史记录，采样由后台任务完成。','Select a server to query history; samples are collected in the background.')}}</p><div class="actions"><select v-model="historyId"><option value="">—</option><option v-for="i in dash?.instances" :key="i.id" :value="i.id">{{i.name}}</option></select><button @click="readHistory">{{text('查询','Query')}}</button></div><article v-for="h in history.slice().reverse()" :key="h.at"><small>{{new Date(h.at).toLocaleString()}}</small><p>{{h.live.sample?.sensors.filter(s=>s.kind!=='discrete').map(s=>s.name+': '+s.value+' '+s.unit).join(' · ')}}</p></article></section>
   <section v-if="tab==='updates'">
    <h2>{{text('软件更新','Software updates')}}</h2>
    <article><p>{{text('当前版本','Installed version')}}: <strong>{{update?.current??'—'}}</strong> · {{update?.deployment??'—'}}</p>
     <div class="actions"><label>{{text('更新通道','Update channel')}}<select v-model="channel" :disabled="updateBusy||!!updateWaiting||update?.state==='downloading'||update?.state==='installing'"><option value="stable">{{text('稳定版','Stable')}}</option><option value="preview">{{text('含预发行版','Include previews')}}</option></select></label><button :disabled="updateBusy||update?.state==='downloading'" @click="updateAction(true)">{{text('检查更新','Check for updates')}}</button></div>
     <p v-if="updateError" role="alert">{{updateError}}</p><p v-if="update?.checkedAt"><small>{{text('检查时间','Last checked')}}: {{new Date(update.checkedAt).toLocaleString()}}</small></p>
     <p v-if="update?.checkedAt&&!update.latest">{{text('没有更新的兼容版本。','No newer compatible release.')}}</p>
     <template v-if="update?.latest"><h3>{{update.latest.tag}}</h3><p>{{(update.latest.size/1048576).toFixed(1)}} MiB · {{update.latest.prerelease?'Pre-release':'Stable'}}</p><pre style="white-space:pre-wrap;overflow-wrap:anywhere">{{update.latest.notes}}</pre><a :href="update.latest.url" target="_blank" rel="noopener noreferrer">{{text('发行说明及手动下载','Release notes and manual download')}}</a>
      <div v-if="update.deployment!=='source'" class="actions"><button v-if="update.canInstall&&update.state!=='ready'" class="primary" :disabled="updateBusy||!!updateWaiting||update.state==='downloading'||update.state==='installing'" @click="installUpdate(true)">{{text('一键更新并重启','Update and restart')}}</button><button :disabled="updateBusy||!!updateWaiting||update.state==='downloading'||update.state==='installing'" @click="updateAction(false)">{{text('下载并校验更新','Download and verify update')}}</button></div>
      <div v-if="update.state==='downloading'"><progress :value="update.downloaded" :max="update.total"></progress><p>{{(update.downloaded/1048576).toFixed(1)}} / {{(update.total/1048576).toFixed(1)}} MiB</p></div>
      <p v-if="update.state==='failed'" role="alert">{{update.error}}</p>
      <button v-if="update.state==='ready'&&update.canInstall" class="primary" :disabled="updateBusy||!!updateWaiting" @click="installUpdate(false)">{{text('安装并自动重启','Install and restart automatically')}}</button><p v-if="update.state==='ready'">{{text('已通过 SHA-256 校验，保存在服务器：','SHA-256 verified; saved on server:')}} <code>{{update.file}}</code></p>
     </template>
     <p v-if="update?.deployment==='binary'">{{text('下载验证后点击安装并自动重启。独立二进制监督进程负责替换和健康检查；失败尝试恢复旧程序，保留版本化备份。若安装按钮不可用，请检查部署权限或使用 CLI。','After verification, select Install and restart automatically. The supervisor replaces the binary, checks health and attempts rollback on failure; versioned backups are retained. If unavailable, check deployment permissions or use the CLI.')}}</p>
     <p v-else-if="update?.deployment==='docker'">{{text('请在宿主机导入新镜像并使用原数据卷重建容器；容器不应自行替换程序。','Load the new image on the host and recreate the container with the same data volume; containers must not replace their own executable.')}}</p>
     <p v-else>{{text('源码部署请更新 Git 仓库并重新构建。','For source deployments, update the repository and rebuild.')}}</p>
     <a :href="releasePage" target="_blank" rel="noopener noreferrer">GitHub Releases</a>
    </article>
   </section>
   <section v-if="tab==='startup'">
    <h2>{{text('启动管理','Startup management')}}</h2><article><h3>{{text('SSH 断开后继续运行','Keep running after SSH disconnect')}}</h3><p>{{text('独立二进制前台运行时，SSH 断开可能终止程序。先停止原进程，再使用 Screen（仅保持当前开机周期运行）或 systemd（推荐长期使用）。','Foreground processes may stop when SSH disconnects. Stop the existing process first, then use Screen for the current boot or systemd for persistent operation.')}}</p><pre>{{'screen -dmS hsfc ./homeserver-fan-control-linux-x64-baseline --host 0.0.0.0 --port 9001\nscreen -r hsfc'}}</pre><small>{{text('示例需按实际路径、端口、数据目录调整。Ctrl+A 然后 D 分离会话；Screen 不等于开机自启。','Adjust path, port and data directory. Ctrl+A then D detaches; Screen is not boot startup.')}}</small><p><a :href="guide+'docs/autostart.md'" target="_blank" rel="noopener">{{text('后台运行及开机自启指南','Background and boot startup guide')}}</a></p></article>
    <article>
     <div class="line"><h3 :class="startup?.state==='enabled'?'ok':'muted'">{{startupLabel(startup)}}</h3><button :disabled="startupBusy" @click="refreshStartup">{{text('重新检测','Refresh status')}}</button></div>
     <p v-if="startupError" role="alert">{{startupError}}</p>
     <template v-if="startup">
      <p>{{startup.manager}} <span v-if="startup.unit">· {{startup.unit}}</span></p>
      <p>{{startupReason(startup)}}</p>
      <p v-if="startup.linger!==undefined">Linger: {{startup.linger?'enabled':'disabled'}}</p>
      <button v-if="startup.canEnable" :disabled="startupBusy" @click="enableStartup">{{text('一键设置开机自启','Enable boot startup')}}</button>
      <p v-if="startup.script">{{text('已自动生成本地自启脚本：','Generated local startup script:')}} <code>{{startup.script}}</code></p><p v-if="startup.commands.length">{{text('如果自动设置不可用，请在宿主机执行以下命令；Docker 请将 CONTAINER 改为实际容器名。','If automatic setup is unavailable, run these commands on the host; set CONTAINER to the actual Docker container name.')}}</p>
      <pre v-if="startup.commands.length" style="white-space:pre-wrap;overflow-wrap:anywhere">{{startup.commands.join('\n')}}</pre>
      <button v-if="startup.commands.length" @click="copyStartup">{{startupCopied?text('已复制','Copied'):text('复制命令','Copy commands')}}</button>
      <p>{{text('不会自动重启或立即启动重复实例。','No automatic restart or immediate duplicate instance is started.')}}</p>
      <a href="https://github.com/censujiang/homeserver-fan-control/blob/master/docs/autostart.md" target="_blank" rel="noopener noreferrer">{{text('完整启动管理指南','Full startup guide')}}</a>
     </template>
    </article>
   </section>
   <section v-if="tab==='events'"><h2>{{text('事件记录','Events')}}</h2><article v-for="e in dash?.events" :key="e.id"><small>{{new Date(e.at).toLocaleString()}}</small><p>{{e.message}}</p></article></section>
  </template>
 </main>
</template>
<style>
*{box-sizing:border-box}body{margin:0;font:15px/1.6 system-ui,sans-serif}main{min-height:100vh;background:#f4f5f7;color:#17212b;padding:clamp(16px,4vw,48px);--surface:#fff;--border:#dce1e7;--sub:#617080;--accent:#185f89}main.dark{background:#13191f;color:#e1e8ef;--surface:#1d2730;--border:#354451;--sub:#b0becb;--accent:#79bde0}header,.line,.actions{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}header small{letter-spacing:.13em}h1,h2,h3{line-height:1.2;margin:10px 0}nav{display:flex;gap:8px;flex-wrap:wrap;margin:24px 0}button,input,select,textarea{font:inherit;border:1px solid var(--border);border-radius:8px;padding:8px 12px;background:var(--surface);color:inherit}button{cursor:pointer}button.active,button[type=submit]{border-color:var(--accent);color:var(--accent)}button:disabled{opacity:.5}section{max-width:1100px;margin:auto}article,.login{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:20px;margin:12px 0}.login{max-width:480px;margin:40px auto}small,.muted{color:var(--sub)}.ok{color:#25805a}.warning{border-left:4px solid #b77920;padding:10px 15px;background:var(--surface)}form{display:grid;gap:12px;max-width:700px}label{display:grid;gap:4px}.check{display:flex;align-items:center}textarea{font-family:monospace;width:100%}.sensors{display:grid;grid-template-columns:repeat(auto-fit,minmax(155px,1fr));gap:8px}.sensor{display:grid;border:1px solid var(--border);border-radius:8px;padding:10px}.sensor strong{font-size:22px}

main{max-width:none;padding:clamp(14px,3vw,36px)}header,nav,main>section,main>p,main>.warning{max-width:1440px;margin-left:auto;margin-right:auto}main>.login{max-width:520px}nav{padding:10px;border:1px solid var(--border);border-radius:12px;background:var(--surface);margin-top:20px;margin-bottom:16px}nav button{border-color:transparent}nav button.active,.primary{background:var(--accent);color:var(--surface);border-color:var(--accent);font-weight:600}main.dark .primary,main.dark nav button.active{color:#13202a}button:focus-visible,input:focus-visible,textarea:focus-visible,select:focus-visible{outline:2px solid var(--accent);outline-offset:2px}section{max-width:1440px}form{max-width:none}form h4{margin:12px 0 0;border-bottom:1px solid var(--border);padding-bottom:6px}.section-head{margin:20px 0}.toolbar{display:flex;gap:14px;flex-wrap:wrap;align-items:center;margin:12px 0}.toolbar input:not([type=checkbox]){min-width:min(100%,300px)}.status-good,.status-muted{border:1px solid var(--border);border-radius:20px;padding:3px 10px;font-size:13px}.status-good{color:#25805a}.status-muted{color:var(--sub)}.sensor-group{margin:20px 0 8px;border-top:1px solid var(--border);padding-top:12px}.sensor-group h4{margin:0 0 8px}.sensor-group p{font-size:13px;margin:6px 0 12px}.sensor{min-width:0;gap:3px}.sensor strong small{font-size:12px}.sensors{grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px}.state-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:5px 16px}.state-row{display:grid;grid-template-columns:1fr auto auto;gap:8px;align-items:center;border-bottom:1px solid var(--border);padding:6px;font-size:13px}.raw{grid-column:1/-1;overflow-wrap:anywhere;font-family:monospace;white-space:pre-wrap}.fault{color:#c44d43}.help{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:10px;color:var(--sub);margin:4px 0}.field-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(135px,1fr));gap:10px;align-items:end}.field-grid input{width:100%;min-width:0}.policy-box{border:1px solid var(--border);border-radius:10px;padding:12px}.policy-box>*{margin-bottom:10px}summary{cursor:pointer;font-weight:600}a{color:var(--accent)}pre{white-space:pre-wrap;overflow-wrap:anywhere}.server-card{padding:clamp(12px,2vw,24px)}@media(max-width:600px){.sensors{grid-template-columns:repeat(2,minmax(0,1fr))}.state-list{grid-template-columns:1fr}.sensor strong{font-size:18px}nav{gap:3px}nav button{padding:6px 8px}article{padding:12px}}
</style>
