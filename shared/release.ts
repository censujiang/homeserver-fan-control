import pkg from '../package.json'
export const currentVersion=pkg.version
export const repository='censujiang/homeserver-fan-control'
export const releasePage='https://github.com/'+repository+'/releases'
export const binaryAsset='homeserver-fan-control-linux-x64-baseline'
export const dockerAsset='homeserver-fan-control-docker-linux-amd64.tar.gz'
export type Channel='stable'|'preview'
export type Deployment='binary'|'docker'|'source'
export interface UpdateRelease {version:string;tag:string;url:string;prerelease:boolean;published:string;notes:string;asset:string;size:number}
export interface UpdateStatus {current:string;deployment:Deployment;channel:Channel;latest:UpdateRelease|null;checkedAt:number|null;state:'idle'|'downloading'|'ready'|'installing'|'failed';downloaded:number;total:number;file?:string;error?:string;canInstall?:boolean}
