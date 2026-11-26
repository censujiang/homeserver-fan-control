import { Database } from 'bun:sqlite'
import { mkdirSync, chmodSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto'
import type { Instance } from '../../shared/model'
export const dataDir=resolve(process.env.HSFC_DATA_DIR??'./data')
let db:Database|undefined, key:Buffer
export function database(){
 if(db)return db
 mkdirSync(dataDir,{recursive:true,mode:0o700})
 chmodSync(dataDir,0o700)
 const keyPath=join(dataDir,'config.key')
 try{writeFileSync(keyPath,randomBytes(32),{flag:'wx',mode:0o600})}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e}
 key=readFileSync(keyPath);if(key.length!==32)throw new Error('Invalid configuration key')
 db=new Database(join(dataDir,'database.sqlite'),{create:true,strict:true})
 chmodSync(join(dataDir,'database.sqlite'),0o600)
 db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;')
 db.transaction(()=>db!.exec(`CREATE TABLE IF NOT EXISTS migrations(version INTEGER PRIMARY KEY);
 CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS instances(id TEXT PRIMARY KEY,body TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS samples(instance TEXT NOT NULL,at INTEGER NOT NULL,body TEXT NOT NULL,PRIMARY KEY(instance,at));
 CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY,at INTEGER NOT NULL,instance TEXT,message TEXT NOT NULL);
 INSERT OR IGNORE INTO migrations VALUES(1);`))()
 return db
}
function encrypt(s:string){const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key,iv);return Buffer.concat([iv,c.update(s),c.final(),c.getAuthTag()]).toString('base64')}
function decrypt(s:string){const b=Buffer.from(s,'base64'),d=createDecipheriv('aes-256-gcm',key,b.subarray(0,12));d.setAuthTag(b.subarray(-16));return Buffer.concat([d.update(b.subarray(12,-16)),d.final()]).toString()}
export function instances():Instance[]{return database().query<{body:string},[]>( 'SELECT body FROM instances').all().map(r=>JSON.parse(decrypt(r.body)))}
export function saveInstance(i:Instance){database().run('INSERT INTO instances VALUES(?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body',[i.id,encrypt(JSON.stringify(i))])}
export function removeInstance(id:string){database().run('DELETE FROM instances WHERE id=?',[id])}
export function event(message:string,instance:string|null=null){database().run('INSERT INTO events(at,instance,message) VALUES(?,?,?)',[Date.now(),instance,message]);console.log(JSON.stringify({at:Date.now(),instance,message}))}
export function setting(k:string){return database().query<{value:string},[string]>('SELECT value FROM settings WHERE key=?').get(k)?.value}
export function setSetting(k:string,v:string){database().run('INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',[k,v])}
