import {expect,type Page} from '@playwright/test';
import path from 'node:path';
import net from 'node:net';
import {spawn,type ChildProcess} from 'node:child_process';
async function freePort():Promise<number>{const server=net.createServer();return new Promise(resolve=>server.listen(0,'127.0.0.1',()=>{const port=(server.address() as net.AddressInfo).port;server.close(()=>resolve(port))}));}
async function stop(child:ChildProcess){if(child.exitCode!==null)return;await new Promise<void>(resolve=>{child.once('exit',()=>resolve());child.kill()});}
export async function startLocalApp(page:Page|undefined,overrides:Record<string,string>={},options:{data?:string}={}){
 const apiPort=await freePort(),uiPort=await freePort(),python=process.env.SCENE_PYTHON||'python';
 const data=path.resolve(options.data||overrides.SCENE_DATA_DIR||`.test-data/app-${Date.now()}-${apiPort}`),apiUrl=`http://127.0.0.1:${apiPort}`,url=`http://127.0.0.1:${uiPort}`;
 const env={...process.env,SCENE_DATA_DIR:data,SCENE_MODEL_PROVIDER:'codex',SCENE_MODEL_MODEL:'fixture-codex-model',SCENE_CODEX_COMMAND:JSON.stringify([python,path.resolve('tests/fixtures/fixed_model.py')]),SCENE_ALIGNMENT_COMMAND:JSON.stringify([python,path.resolve('tests/fixtures/fixed_alignment.py')]),SCENE_ALIGNMENT_PROFILE:'normal',SCENE_FAULT_CONTROL:'',...overrides};
 let log='';
 const launch=(command:string,args:string[],environment:NodeJS.ProcessEnv)=>{const child=spawn(command,args,{env:environment,stdio:'pipe',windowsHide:true});child.stdout?.on('data',chunk=>log+=chunk.toString());child.stderr?.on('data',chunk=>log+=chunk.toString());return child};
 const startApi=()=>launch(python,['-m','uvicorn','server.app:app','--host','127.0.0.1','--port',String(apiPort)],env);
 let backend=startApi();
 const frontend=launch(process.execPath,[path.resolve('node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port',String(uiPort)],{...process.env,SCENE_API_URL:apiUrl});
 const ready=async(endpoint=apiUrl+'/api/materials')=>{try{await expect.poll(async()=>{try{return page?(await page.request.get(endpoint,{timeout:1000})).status():(await fetch(endpoint,{signal:AbortSignal.timeout(1000)})).status}catch{return 0}},{timeout:20000}).toBe(200)}catch(error){throw new Error(`${String(error)}\nOwned app log:\n${log}`)}};
 const close=async()=>{await stop(backend);await stop(frontend)};
 try{await ready();await ready(url)}catch(error){await close();throw error}
 return{url,apiUrl,data,logs:()=>log,ready,stopApi:async()=>stop(backend),restartApi:async(patch:Record<string,string>={})=>{await stop(backend);Object.assign(env,patch);backend=startApi();await ready()},close};
}
