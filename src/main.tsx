import React, {useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import './style.css';
import {api,type Material,type Cue} from './api';
import {VersionedLearningPlayer} from './VersionedLearningPlayer';
import {ReportView,ReportLibrary,formatPosition,type LearningReport,type ReportSummary} from './ReportView';
import {PreprocessingPanel} from './PreprocessingPanel';
import {Notebook,NotebookReview} from './Notebook';
import {Modal} from './Modal';
type Program={id:string;name:string};
export function App(){
 const [materials,setMaterials]=useState<Material[]>([]),[selected,setSelected]=useState<Material|null>(null),[detail,setDetail]=useState<Material|null>(null);
 const [programs,setPrograms]=useState<Program[]>([]),[program,setProgram]=useState(''),[query,setQuery]=useState('');
 const [uploadOpen,setUploadOpen]=useState(false),[createOpen,setCreateOpen]=useState(false),[modalError,setModalError]=useState('');
 const [packageChanges,setPackageChanges]=useState<Record<string,number>>({});
 const [cues,setCues]=useState<Cue[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false),[libraryLoading,setLibraryLoading]=useState(true);
 const [view,setView]=useState<'library'|'settings'|'report'|'reports'|'notebook'|'review'>('library'),[report,setReport]=useState<LearningReport|null>(null),[reports,setReports]=useState<ReportSummary[]>([]),[reportLoading,setReportLoading]=useState(false),[reviewId,setReviewId]=useState('');
 const opening=useRef(false);
 const load=async()=>{try{const [items,groups]=await Promise.all([api<Material[]>('/api/materials'),api<Program[]>('/api/programs')]);setMaterials(items);setPrograms(groups)}catch(e){setError((e as Error).message)}finally{setLibraryLoading(false)}};
 function versionsChanged(id:string){void load();setPackageChanges(previous=>({...previous,[id]:(previous[id]||0)+1}))}
 useEffect(()=>{void load()},[]);
 useEffect(()=>{
  let revision=0;
  async function route(){
   const current=++revision,hash=window.location.hash;setError('');setSelected(null);setReportLoading(false);
   if(hash.startsWith('#report=')){
    setView('report');setReport(null);setReportLoading(true);
    try{const result=await api<LearningReport>(`/api/reports/${encodeURIComponent(hash.slice(8))}`);if(current===revision)setReport(result)}catch(e){if(current===revision)setError((e as Error).message)}finally{if(current===revision)setReportLoading(false)}
   }else if(hash==='#reports'){
    setView('reports');setReportLoading(true);
    try{const result=await api<ReportSummary[]>('/api/reports');if(current===revision)setReports(result)}catch(e){if(current===revision)setError((e as Error).message)}finally{if(current===revision)setReportLoading(false)}
   }else if(hash==='#notebook')setView('notebook');
   else if(hash.startsWith('#review=')){setReviewId(hash.slice(8));setView('review')}
   else if(hash==='#settings')setView('settings');
   else setView('library');
  }
  void route();window.addEventListener('hashchange',route);return()=>{revision++;window.removeEventListener('hashchange',route)};
 },[]);
 function back(){setSelected(null);window.location.hash='';setView('library');void load()}
 async function finish(packageId:string,reason:'user'|'video_end',startMs:number,endMs:number,sessionId:string){
  const saved=await api<LearningReport>(`/api/packages/${packageId}/reports`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({reason,start_ms:Math.round(startMs),end_ms:Math.round(endMs),session_id:sessionId})});
  if(document.fullscreenElement)await document.exitFullscreen();setSelected(null);window.location.hash=`report=${saved.id}`;
 }
 async function submit(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();if(busy)return;setModalError('');setBusy(true);const data=new FormData(event.currentTarget);
  const subtitle=data.get('subtitles');if(subtitle instanceof File&&!subtitle.size)data.delete('subtitles');
  try{await api('/api/materials',{method:'POST',body:data});await load();setUploadOpen(false)}
  catch(e){setModalError((e as Error).message)}finally{setBusy(false)}
 }
 async function create(event:React.FormEvent<HTMLFormElement>){event.preventDefault();setBusy(true);setModalError('');try{const group=await api<Program>('/api/programs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:new FormData(event.currentTarget).get('name')})});await load();setProgram(group.id);setCreateOpen(false)}catch(e){setModalError((e as Error).message)}finally{setBusy(false)}}
 async function open(material:Material){if(opening.current)return;opening.current=true;setBusy(true);setModalError('');try{setCues(await api<Cue[]>(`/api/materials/${material.id}/subtitles`));setSelected(material);setDetail(null)}catch(e){setModalError((e as Error).message)}finally{opening.current=false;setBusy(false)}}
 async function assign(value:string){if(!detail)return;setBusy(true);setModalError('');try{await api(`/api/materials/${detail.id}/program`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({program_id:value})});setDetail({...detail,program_id:value});await load()}catch(e){setModalError((e as Error).message)}finally{setBusy(false)}}
 const learning=view==='library'&&!!selected,reportArea=['report','reports','notebook'].includes(view);
 const scoped=materials.filter(m=>(!program||m.program_id===program)&&(m.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())));
 const currentProgram=programs.find(p=>p.id===program);
 return <main className={learning?'learning-shell':view==='review'?'review-shell':'workbench'}>
 {!learning&&view!=='review'&&<aside className="app-sidebar"><a className="brand" href="#" onClick={back}><span className="brand-mark">S</span><span>Scene<span className="brand-caption">英语情境学习</span></span></a><nav aria-label="主导航"><a href="#" aria-label="素材库" aria-current={view==='library'?'page':undefined}>▦ <span>素材库</span></a><a href="#reports" aria-label="学习报告" aria-current={reportArea?'page':undefined}>▤ <span>学习报告</span></a><a href="#settings" aria-label="设置" aria-current={view==='settings'?'page':undefined}>⚙ <span>设置</span></a></nav><p className="sidebar-note">在故事里，<br/>找到自己的表达。</p><span className="sidebar-footer">SCENE / ENGLISH</span></aside>}
 <div className={learning||view==='review'?'active-content':'workspace-content'}>
 {!learning&&view!=='review'&&<header className="workspace-header"><div><p className="eyebrow">{view==='library'?'YOUR COLLECTION':reportArea?'YOUR LEARNING':'PREFERENCES'}</p><h1>{view==='library'?'素材库':reportArea?'学习报告':'设置'}</h1></div>{view==='library'&&<button onClick={()=>{setModalError('');setUploadOpen(true)}}>＋ 上传素材</button>}</header>}
 {error&&<p role="alert" className="error">{error}<button className="secondary" onClick={()=>{setError('');void load()}}>重新读取</button></p>}
 {reportArea&&<><div className="section-tabs"><a href="#reports" aria-current={view!=='notebook'?'page':undefined}>学习报告</a><a href="#notebook" aria-current={view==='notebook'?'page':undefined}>错题本</a></div><p className="muted">回顾每次学习，重新练习卡顿的原句。英语能力评估与趋势分析将在后续提供。</p></>}
 {reportLoading&&<p role="status">正在读取学习报告…</p>}
 {view==='report'&&report&&<ReportView report={report} onBack={back}/>}
 {view==='reports'&&!reportLoading&&<ReportLibrary reports={reports} onBack={back} onOpen={id=>{window.location.hash=`report=${id}`}}/>}
 {view==='notebook'&&<Notebook onBack={back} onError={setError}/>}
 {view==='review'&&<NotebookReview key={reviewId} reviewId={reviewId} onBack={()=>{window.location.hash='notebook'}} onError={setError}/>}
 {view==='settings'&&<section className="settings-page"><h2>专注于当前这一句</h2><p>学习模式、画面蒙版和学习版本，可以在视频左上角的「设置」中调整。</p><div className="setting-row"><div><h3>本机学习偏好</h3><p className="muted">蒙版浓度与所选学习版本会自动保留。作答、报告与错题由本地服务保存。</p></div></div><div className="setting-row"><div><h3>视频与字幕</h3><p className="muted">支持 H.264 / AAC 编码的 MP4，英文字幕使用 UTF-8 SRT / VTT。含英文文本字幕轨的视频可单独上传。</p></div></div></section>}
 {view==='library'&&!selected&&<><section className="program-section" aria-label="节目单"><div className="section-heading"><h2>节目单</h2><button className="text-button" onClick={()=>{setModalError('');setCreateOpen(true)}}>＋ 新建节目</button></div><div className="program-list"><button className="program-card" aria-pressed={!program} onClick={()=>setProgram('')}><span className="program-monogram">全部</span><span><strong>全部素材</strong><small>{materials.length} 个视频</small></span></button>{programs.map(p=><button className="program-card" aria-pressed={program===p.id} key={p.id} onClick={()=>setProgram(p.id)}><span className="program-monogram">{p.id==='peppa'?'Pp':p.name.slice(0,2)}</span><span><strong>{p.name}</strong><small>{materials.filter(m=>m.program_id===p.id).length} 个视频</small></span></button>)}</div></section>
 <section className="videos-section"><div className="section-heading video-heading"><h2>{currentProgram?.name||'所有视频'} <span className="count">{scoped.length}</span></h2><input type="search" aria-label="搜索视频" placeholder="搜索视频标题…" value={query} onChange={e=>setQuery(e.target.value)}/></div>{libraryLoading?<p role="status">正在读取素材库…</p>:scoped.length===0?<div className="empty-library"><h3>{query?'没有找到匹配的视频':'这里的故事，等你开始'}</h3><p>{query?'换一个关键词，或切换节目试试。':'上传视频和英文字幕，建立你的学习素材库。'}</p><button className="secondary" onClick={()=>{if(query){setQuery('');setProgram('')}else{setModalError('');setUploadOpen(true)}}}>{query?'清除筛选':'上传第一个视频'}</button></div>:<div className="video-grid">{scoped.map(m=><button className="video-card" key={m.id} aria-label={`查看详情 ${m.name}`} onClick={()=>{setDetail(m);setModalError('')}}><div className="video-cover"><img loading="lazy" src={`/api/materials/${m.id}/poster`} alt="" onError={e=>{e.currentTarget.style.visibility='hidden'}}/><span className="cover-play">▷</span><span className="duration">{formatPosition(m.duration_ms)}</span></div><div className="video-meta"><h3>{m.name.replace(/\.mp4$/i,'')}</h3><p>{programs.find(p=>p.id===m.program_id)?.name||'未归类'}<span>{m.status==='ready'?'可以开始学习':'已导入'}</span></p><p data-testid="learning-position" className="video-position">{m.learning_position?`继续学习 · ${formatPosition(m.learning_position.position_ms)}`:'尚未开始学习'}</p></div></button>)}</div>}</section></>}
 {learning&&selected&&<VersionedLearningPlayer key={selected.id} material={selected} cues={cues} onBack={back} onError={setError} onFinish={finish} refreshKey={packageChanges[selected.id]||0} onVersionsChanged={()=>versionsChanged(selected.id)}/>}
 </div>
 {uploadOpen&&<Modal title="上传学习素材" busy={busy} onClose={()=>setUploadOpen(false)}><p className="muted">带来一段喜欢的视频，让故事成为你的英语课堂。</p><form className="upload-form" onSubmit={submit}><label className="file-drop">视频文件<input autoFocus name="video" aria-label="视频文件" type="file" accept="video/mp4,.mp4" required disabled={busy}/><small>MP4 · H.264 / AAC</small></label><label>英文字幕 <span className="muted">可选 · 视频含内嵌英文文本字幕时无需上传</span><input name="subtitles" aria-label="英文字幕" type="file" accept=".srt,.vtt" disabled={busy}/></label><p className="upload-help">如果字幕直接印在画面上，请同时提供英文 SRT / VTT 文件。</p><label>所属节目<select name="program_id" defaultValue={program}><option value="">自动归类 / 未归类</option>{programs.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>{modalError&&<p role="alert" className="error">{modalError}</p>}<div className="dialog-actions"><button type="button" className="secondary" disabled={busy} onClick={()=>setUploadOpen(false)}>取消</button><button disabled={busy}>{busy?'正在读取素材…':'导入素材'}</button></div>{busy&&<p role="status">正在检查视频与字幕，请稍候。完成后将自动回到素材库。</p>}</form></Modal>}
 {createOpen&&<Modal title="新建节目" busy={busy} onClose={()=>setCreateOpen(false)}><p className="muted">把同一节目的视频放在一起。</p><form className="upload-form" onSubmit={create}><label>节目名称<input autoFocus name="name" required maxLength={80} disabled={busy} placeholder="例如：日常英语短片"/></label>{modalError&&<p role="alert" className="error">{modalError}</p>}<div className="dialog-actions"><button disabled={busy}>{busy?'正在创建…':'创建节目'}</button></div></form></Modal>}
 {detail&&<Modal title="视频详情" busy={busy} onClose={()=>setDetail(null)}><img className="detail-cover" src={`/api/materials/${detail.id}/poster`} alt="视频画面预览"/><h3 className="detail-title">{detail.name.replace(/\.mp4$/i,'')}</h3><p className="muted">{formatPosition(detail.duration_ms)} · 英文字幕已就绪</p><label>所属节目<select aria-label="所属节目" disabled={busy} value={detail.program_id||''} onChange={e=>void assign(e.target.value)}><option value="">未归类</option>{programs.map(p=><option value={p.id} key={p.id}>{p.name}</option>)}</select></label><p className="muted">{detail.learning_position?`上次学到 ${formatPosition(detail.learning_position.position_ms)}，进度已保存。`:'从故事开始，一句一句练习。'}</p><details className="detail-preparation"><summary>学习资料</summary><PreprocessingPanel materialId={detail.id} refreshKey={packageChanges[detail.id]||0} onReady={()=>versionsChanged(detail.id)} onError={setModalError}/></details>{modalError&&<p role="alert" className="error">{modalError}</p>}<div className="dialog-actions"><button disabled={busy} onClick={()=>void open(detail)}>{busy?'正在读取…':detail.learning_position?'继续学习':'开始学习'}</button></div></Modal>}
 </main>
}
createRoot(document.getElementById('root')!).render(<App/>);
