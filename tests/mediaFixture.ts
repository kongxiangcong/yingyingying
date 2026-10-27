import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
export function generateMediaFixture(directory:string,subtitles:string){
 fs.mkdirSync(directory,{recursive:true});let root=process.cwd();while(!fs.existsSync(path.join(root,'.local-tools'))&&path.dirname(root)!==root)root=path.dirname(root);
 execFileSync(path.join(root,'.local-tools/bin/ffmpeg.exe'),['-y','-f','lavfi','-i','color=c=blue:s=640x360:r=25:d=8','-f','lavfi','-i',"aevalsrc=0.4*sin(2*PI*220*t)*between(t\\,0.2\\,0.5)+0.4*sin(2*PI*660*t)*between(t\\,2.2\\,2.7)+0.4*sin(2*PI*1760*t)*between(t\\,5.2\\,5.7):s=48000:d=8",'-c:v','libx264','-c:a','aac','-shortest',path.join(directory,'tones.mp4')],{stdio:'ignore'});
 fs.writeFileSync(path.join(directory,'english.srt'),subtitles);
}
