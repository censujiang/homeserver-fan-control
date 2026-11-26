export interface AutostartStatus {
 state:'enabled'|'disabled'|'unknown'
 manager:'systemd-system'|'systemd-user'|'docker'|'none'
 canEnable:boolean
 unit?:string
 active?:boolean
 linger?:boolean
 reason:string
 commands:string[]
}
