export type Material={id:string;name:string;status:string;duration_ms:number;program_id?:string;learning_position?:{package_id:string;version_number:number;position_ms:number}|null};
export type Cue={id:string;start_ms:number;end_ms:number;text:string};
export async function api<T>(url:string,options?:RequestInit):Promise<T>{
 const response=await fetch(url,options);const body=await response.json();
 if(!response.ok)throw new Error(typeof body.detail==='string'?body.detail:'操作失败');return body;
}
export type Token={word:string;prefix:string;suffix:string};
export type Question={id:string;source_ids:string[];english:string;chinese:string;pause_ms:number;start_ms:number;end_ms:number;tokens:Token[];hint_indices:number[];card:{usage:string;pattern:string;explanation:string;example:string;translation:string}};
export type ExercisePackage={id:string;material_id:string;schema_version:number;questions:Question[]};
export type Attempt={inputs:string[];errors:number;highest_hint:number;completed:boolean;revealed:boolean;generation?:number;revision?:number;session_id?:string|null};
export const normalize=(text:string)=>text.trim().toLowerCase().replace(/[’‘]/g,"'");

export type PlayerProgress={position_ms:number;active_question_id:string|null;revision?:number;session_id?:string|null};
