<script setup lang="ts">
import { defaultPolicy, type Manifest, type Instance, type Policy } from './shared/model'
type PublicInstance=Omit<Instance,'config'> & {configuredFields:string[];live:{online:boolean;error?:string;sample?:{at:number;identity:string|null;health:string;fanMode?:string;fanLevel?:number;sensors:{id:string;name:string;kind:string;value:number|null;unit:string;health:string}[]};capability?:{reason:string};decision?:{target:number|null;reason:string}}}
type Dashboard={plugins:Manifest[];instances:PublicInstance[];events:{id:number;at:number;message:string;instance:string|null}[]}
const token=ref(''), password=ref(''), setupToken=ref(''), needsSetup=ref(false), error=ref(''), busy=ref(false), dash=ref<Dashboard>(), tab=ref('monitor'), dark=ref(false), lang=ref('zh')
const text=(zh:string,en:string)=>lang.value==='zh'?zh:en
const form=reactive({id:'',name:'',plugin:'mock',transport:'mock',mode:'MONITOR',enabled:true,config:{} as Record<string,unknown>,policy:JSON.stringify(defaultPolicy,null,2)})
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
 if(!token.value)return
 try{dash.value=await $fetch<Dashboard>('/api/dashboard',{headers:auth()})}
 catch(e){if((e as {statusCode?:number}).statusCode===401){token.value='';sessionStorage.removeItem('token')}else error.value=text('读取失败','Refresh failed')}
}
async function action(f:()=>Promise<void>){busy.value=true;error.value='';try{await f()}catch(e){error.value=(e as Error).message}finally{busy.value=false}}
async function signIn(){await action(async()=>{
 if(needsSetup.value){await $fetch('/api/auth/setup',{method:'POST',body:{token:setupToken.value,password:password.value}});needsSetup.value=false}
 const result=await $fetch<{token:string}>('/api/auth/login',{method:'POST',body:{password:password.value}})
 token.value=result.token;sessionStorage.setItem('token',token.value);password.value='';setupToken.value='';await refresh()
})}
async function signOut(){await $fetch('/api/auth/logout',{method:'POST',headers:auth()}).catch(()=>{});token.value='';sessionStorage.removeItem('token');dash.value=undefined}
function reset(){
 form.id='';form.name='';form.plugin='mock';form.transport='mock';form.mode='MONITOR';form.enabled=true;form.config={};form.policy=JSON.stringify({...defaultPolicy,sensors:[{id:'cpu',warm:40,hot:65}],fans:['fan']},null,2)
}
function selectPlugin(){form.transport=manifest.value?.modes[0]?.id??'';selectTransport()}
function selectTransport(){form.config=Object.fromEntries(fields.value.filter(f=>f.default!==undefined).map(f=>[f.key,f.default]))}
function edit(i:PublicInstance){form.id=i.id;form.name=i.name;form.plugin=i.plugin;form.transport=i.transport;form.mode=i.mode;form.enabled=i.enabled;form.config={};form.policy=JSON.stringify(i.policy,null,2);tab.value='servers'}
async function save(){await action(async()=>{
 const body={name:form.name,plugin:form.plugin,transport:form.transport,mode:form.mode,enabled:form.enabled,policy:JSON.parse(form.policy) as Policy,...(!form.id||Object.keys(form.config).length?{config:form.config}:{})}
 await $fetch(form.id?'/api/instances/'+form.id:'/api/instances',{method:form.id?'PUT':'POST',headers:auth(),body})
 reset();await refresh()
})}
async function remove(id:string){if(!confirm(text('删除此服务器配置？','Remove this server?')))return;await action(async()=>{await $fetch('/api/instances/'+id,{method:'DELETE',headers:auth()});await refresh()})}
async function readHistory(){if(!historyId.value)return;await action(async()=>{history.value=await $fetch('/api/history',{headers:auth(),query:{id:historyId.value,from:Date.now()-86400000}})})}
let timer:ReturnType<typeof setInterval>|undefined
onMounted(async()=>{reset();token.value=sessionStorage.getItem('token')??'';dark.value=matchMedia('(prefers-color-scheme: dark)').matches;const s=await $fetch<{setup:boolean}>('/api/auth/status');needsSetup.value=s.setup;await refresh();timer=setInterval(refresh,5000)})
onBeforeUnmount(()=>clearInterval(timer))
</script>
<template>
 <main :class="{dark}">
  <header><div><small>HOMESERVER / CONTROL</small><h1>{{text('智能散热管理','Fan Control')}}</h1></div><div class="actions"><button @click="lang=lang==='zh'?'en':'zh'">{{lang==='zh'?'EN':'中文'}}</button><button @click="dark=!dark">{{dark?'☀':'☾'}}</button><button v-if="token" @click="signOut">{{text('退出','Sign out')}}</button></div></header>
  <div v-if="error" role="alert" class="warning">{{error}}</div>
  <section v-if="!token" class="login"><h2>{{needsSetup?text('初始化管理员','Initialize administrator'):text('管理员登录','Administrator login')}}</h2><form @submit.prevent="signIn"><label v-if="needsSetup">{{text('数据目录 setup-token 文件中的密钥','Token from setup-token in data directory')}}<input v-model="setupToken" type="password" required></label><label>{{text('管理员密码','Password')}}<input v-model="password" type="password" required :minlength="needsSetup?12:1"></label><button :disabled="busy">{{text('继续','Continue')}}</button></form></section>
  <template v-else>
   <nav><button v-for="[id,zh,en] in [['monitor','监控','Monitor'],['servers','服务器 / 策略','Servers / policies'],['plugins','插件','Plugins'],['history','历史','History'],['events','事件','Events']]" :key="id" :class="{active:tab===id}" @click="tab=id">{{text(zh,en)}}</button></nav>
   <p class="warning">{{text('安全预览：当前硬件驱动禁止写入，原厂自动散热不受影响。','Safety preview: all physical hardware writes are blocked. Factory cooling remains untouched.')}}</p>
   <section v-if="tab==='monitor'">
    <h2>{{text('实时状态','Live status')}}</h2><p v-if="!dash?.instances.length">{{text('尚未添加服务器。','No servers configured.')}}</p>
    <article v-for="i in dash?.instances" :key="i.id"><div class="line"><h3>{{i.name}}</h3><span :class="i.live.online?'ok':'muted'">{{i.live.online?'ONLINE':'OFFLINE'}}</span></div><p>{{i.transport}} · {{i.mode}} · {{i.live.sample?.health??'unknown'}} · {{i.live.sample?.fanMode??'—'}}</p><p>{{i.live.error??i.live.capability?.reason}}</p><p v-if="i.live.sample">{{new Date(i.live.sample.at).toLocaleString()}} · {{text('风扇目标','Fan target')}} {{i.live.sample.fanLevel??'—'}}%</p><p v-if="i.live.decision">{{text('模拟目标','Simulated target')}} {{i.live.decision.target??'AUTO'}} · {{i.live.decision.reason}}</p>
     <div class="sensors"><div v-for="s in i.live.sample?.sensors" :key="s.id" class="sensor"><small>{{s.name}}</small><strong>{{s.value??'—'}} <small>{{s.unit}}</small></strong><small>{{s.kind}} · {{s.health}}</small></div></div>
    </article>
   </section>
   <section v-if="tab==='servers'"><h2>{{text('服务器和温控策略','Servers and policies')}}</h2>
    <article v-for="i in dash?.instances" :key="i.id" class="line"><span>{{i.name}} · {{i.mode}}</span><div class="actions"><button @click="edit(i)">{{text('编辑','Edit')}}</button><button @click="remove(i.id)">{{text('删除','Delete')}}</button></div></article>
    <article><h3>{{form.id?text('编辑配置','Edit configuration'):text('添加服务器','Add server')}}</h3><form @submit.prevent="save">
      <label>{{text('名称','Name')}}<input v-model="form.name" required></label>
      <label>{{text('硬件插件','Hardware plugin')}}<select v-model="form.plugin" @change="selectPlugin"><option v-for="p in dash?.plugins" :key="p.id" :value="p.id">{{p.name}}</option></select></label>
      <label>{{text('连接方式','Transport')}}<select v-model="form.transport" @change="selectTransport"><option v-for="m in manifest?.modes" :key="m.id" :value="m.id">{{m.label}}</option></select></label>
      <p v-if="form.id">{{text('不填写连接参数则保留旧配置；如修改则完整填写。','Leave all connection fields empty to retain old config; otherwise enter complete config.')}}</p>
      <label v-for="f in fields" :key="f.key">{{f.label}}<input v-model="form.config[f.key]" :type="f.type" :required="!form.id&&f.required"></label>
      <label>{{text('运行模式','Mode')}}<select v-model="form.mode"><option>AUTO</option><option>MONITOR</option><option>DRY_RUN</option><option disabled>ADAPTIVE</option></select></label>
      <label class="check"><input v-model="form.enabled" type="checkbox">{{text('启用监控','Enable monitoring')}}</label>
      <label>{{text('策略 JSON（仅模拟，阈值须校准）','Policy JSON (simulation only; calibrate thresholds)')}}<textarea v-model="form.policy" rows="14" spellcheck="false"></textarea></label>
      <div class="actions"><button :disabled="busy">{{text('保存','Save')}}</button><button type="button" @click="reset">{{text('重置','Reset')}}</button></div>
    </form></article>
   </section>
   <section v-if="tab==='plugins'"><h2>{{text('内置插件','Built-in plugins')}}</h2><article v-for="p in dash?.plugins" :key="p.id"><h3>{{p.name}} <small>{{p.version}}</small></h3><p>{{p.description}}</p><p>{{p.modes.map(m=>m.label).join(' / ')}}</p></article><h2>{{text('外置插件（实验功能）','External plugins (experimental)')}}</h2><p>{{text('安装不会执行代码。隔离执行需管理员在宿主机显式启用，尚待验证。','Installation does not execute code. Isolated execution requires host opt-in and remains unverified.')}}</p><input type="file" accept=".zip" @change="chooseFile"><button :disabled="busy||!uploadFile" @click="upload">{{text('上传 ZIP','Upload ZIP')}}</button><article v-for="p in installedPlugins" :key="p.id"><h3>{{p.name}} · {{p.version}}</h3><p>{{p.id}}</p><div class="actions"><button @click="managePlugin(p.id,true)">{{text('启用','Enable')}}</button><button @click="managePlugin(p.id,false)">{{text('禁用','Disable')}}</button><button @click="uninstallPlugin(p.id)">{{text('卸载','Uninstall')}}</button></div></article></section>
   <section v-if="tab==='history'"><h2>{{text('过去24小时采样','Last 24 hours')}}</h2><div class="actions"><select v-model="historyId"><option value="">—</option><option v-for="i in dash?.instances" :key="i.id" :value="i.id">{{i.name}}</option></select><button @click="readHistory">{{text('查询','Query')}}</button></div><article v-for="h in history.slice().reverse()" :key="h.at"><small>{{new Date(h.at).toLocaleString()}}</small><p>{{h.live.sample?.sensors.filter(s=>s.kind!=='discrete').map(s=>s.name+': '+s.value+' '+s.unit).join(' · ')}}</p></article></section>
   <section v-if="tab==='events'"><h2>{{text('事件记录','Events')}}</h2><article v-for="e in dash?.events" :key="e.id"><small>{{new Date(e.at).toLocaleString()}}</small><p>{{e.message}}</p></article></section>
  </template>
 </main>
</template>
<style>
*{box-sizing:border-box}body{margin:0;font:15px/1.6 system-ui,sans-serif}main{min-height:100vh;background:#f4f5f7;color:#17212b;padding:clamp(16px,4vw,48px);--surface:#fff;--border:#dce1e7;--sub:#617080;--accent:#185f89}main.dark{background:#13191f;color:#e1e8ef;--surface:#1d2730;--border:#354451;--sub:#b0becb;--accent:#79bde0}header,.line,.actions{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}header small{letter-spacing:.13em}h1,h2,h3{line-height:1.2;margin:10px 0}nav{display:flex;gap:8px;flex-wrap:wrap;margin:24px 0}button,input,select,textarea{font:inherit;border:1px solid var(--border);border-radius:8px;padding:8px 12px;background:var(--surface);color:inherit}button{cursor:pointer}button.active,button[type=submit]{border-color:var(--accent);color:var(--accent)}button:disabled{opacity:.5}section{max-width:1100px;margin:auto}article,.login{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:20px;margin:12px 0}.login{max-width:480px;margin:40px auto}small,.muted{color:var(--sub)}.ok{color:#25805a}.warning{border-left:4px solid #b77920;padding:10px 15px;background:var(--surface)}form{display:grid;gap:12px;max-width:700px}label{display:grid;gap:4px}.check{display:flex;align-items:center}textarea{font-family:monospace;width:100%}.sensors{display:grid;grid-template-columns:repeat(auto-fit,minmax(155px,1fr));gap:8px}.sensor{display:grid;border:1px solid var(--border);border-radius:8px;padding:10px}.sensor strong{font-size:22px}
</style>
