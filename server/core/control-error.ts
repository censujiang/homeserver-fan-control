// Only fixed, credential-free messages from the control path may reach the UI.
export class ControlError extends Error{
 constructor(message:string){super(message);this.name='ControlError'}
}
