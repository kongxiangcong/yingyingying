import {useEffect,useRef,useState} from 'react';
import {api} from './api';
import {LearningPlayer,type LearningPlayerProps} from './LearningPlayer';

type Version={id:string;created_at:string};
type Props=Omit<LearningPlayerProps,'packageId'|'onPackagePublished'>&{refreshKey:number;onVersionsChanged:()=>void};

export function VersionedLearningPlayer({refreshKey,onVersionsChanged,...playerProps}:Props){
 const {material,onError}=playerProps;
 const [versions,setVersions]=useState<Version[]>([]),[selected,setSelected]=useState(''),[loading,setLoading]=useState(true);
 const chosen=useRef('');
 const storageKey=`scene:package:${material.id}`;
 function remember(id:string){chosen.current=id;setSelected(id);try{localStorage.setItem(storageKey,id)}catch{/* Selection remains usable if browser preference storage is disabled. */}}
 async function refresh(preferred?:string){
  const list=await api<Version[]>(`/api/materials/${material.id}/packages`);setVersions(list);
  let saved='';try{saved=localStorage.getItem(storageKey)||''}catch{/* Preferences are optional; package data is saved by the service. */}
  const next=[preferred,chosen.current,saved,list[0]?.id].find(id=>id&&list.some(version=>version.id===id))||'';
  remember(next);setLoading(false);
 }
 useEffect(()=>{void refresh().catch(error=>{onError(error.message);setLoading(false)})},[material.id,refreshKey]);
 async function prepared(){await refresh();onVersionsChanged()}
 const versionNumber=versions.length-versions.findIndex(version=>version.id===selected);
 const settings=versions.length>0?<label>学习版本<select aria-label="练习包版本" value={selected} onChange={event=>remember(event.target.value)}>{versions.map((version,index)=><option key={version.id} value={version.id}>第 {versions.length-index} 版{index===0?' · 最新':''}</option>)}</select><small className="muted">第 {versionNumber} 版。各版本独立保存进度、报告与错题。</small></label>:null;
 return <section className="versioned-learning">
 {loading?<p role="status">正在读取学习资料…</p>:<LearningPlayer key={`${material.id}/${selected||'unpackaged'}`} {...playerProps} settingsSlot={settings} packageId={selected||undefined} onExercisesReady={prepared}/>}
 </section>
}
