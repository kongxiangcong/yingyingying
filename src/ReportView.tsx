import type {Attempt,Question} from './api';

export type LearningReport={
 id:string;package_id:string;material_id:string;material_name:string;created_at:string;reason:'user'|'video_end';session_id?:string;
 range:{start_ms:number;end_ms:number};
 counts:{completed:number;revealed:number;unfinished:number;no_hint:number;stalled:number;errors:number;hints:number[]};
 finished:{question_id:string;position_ms:number;status:'completed'|'revealed';english:string;chinese:string;card:Question['card'];attempt:Attempt}[];
 unfinished:{question_id:string;position_ms:number}[];
};
export type ReportSummary=Omit<LearningReport,'finished'|'unfinished'>;
export const formatPosition=(ms:number)=>`${Math.floor(ms/60000)}:${String(Math.floor(ms/1000)%60).padStart(2,'0')}`;
const hintLabels=['无提示','Tips','Tips Pro','Pro Max'];
export function ReportView({report,onBack}:{report:LearningReport;onBack:()=>void}){
 return <section className="report-view panel" aria-label="已保存的学习报告"><div className="report-heading"><div><span className="eyebrow">LEARNING REPORT</span><h2>学习报告</h2><p>{report.material_name} · {report.reason==='user'?'主动结束':'视频结束'}</p><p className="muted">练习包 {report.package_id.slice(0,8)} · {new Date(report.created_at).toLocaleString()}<br/>开始位置 {formatPosition(report.range.start_ms)} · 结束位置 {formatPosition(report.range.end_ms)}</p></div><button onClick={onBack}>返回素材库</button></div>
 <div className="report-counts"><span data-testid="completed-count">已完成 {report.counts.completed}</span><span data-testid="revealed-count">揭晓 {report.counts.revealed}</span><span data-testid="unfinished-count">未做题 {report.counts.unfinished}</span></div>
 <p>无提示通过 {report.counts.no_hint} · 卡顿题 {report.counts.stalled} · 错误次数 {report.counts.errors}</p><p className="muted">{report.session_id?'仅统计本次学习期间的作答，历史学习进度单独保留。':'历史报告快照，保留原有统计。'}</p><p className="muted">作答记录的最高提示：{hintLabels.map((label,index)=>`${label} ${report.counts.hints[index]}`).join(' · ')}</p>
 <div className="report-cards">{report.finished.map(item=><article className="sentence-card" key={item.question_id}><p className="muted">{formatPosition(item.position_ms)} · {item.status==='revealed'?'Pro Max 揭晓':`${hintLabels[item.attempt.highest_hint]}通过`} · 错误 {item.attempt.errors}</p><h3>{item.english}</h3><p>{item.chinese}</p><p><strong>情境用途：</strong>{item.card.usage}</p><p><strong>表达骨架：</strong>{item.card.pattern}</p><details><summary>展开结构与迁移例句</summary><p>{item.card.explanation}</p><p>{item.card.example}</p><p>{item.card.translation}</p></details></article>)}</div>
 {report.unfinished.length>0&&<section className="unfinished-questions"><h3>未做题位置</h3><p className="muted">这些题目本次没有完成记录；以前的进度保留，答案和句式卡暂不展示。</p><ul>{report.unfinished.map(item=><li key={item.question_id}>{formatPosition(item.position_ms)}</li>)}</ul></section>}
 </section>
}
export function ReportLibrary({reports,onOpen,onBack}:{reports:ReportSummary[];onOpen:(id:string)=>void;onBack:()=>void}){
 return <section className="panel"><div className="report-heading"><h2>已保存的学习报告</h2><button onClick={onBack}>返回素材库</button></div>{reports.length===0?<p className="muted">结束一次学习后，报告会保存在这里。</p>:reports.map(report=><article className="saved-report" key={report.id}><h3>{report.material_name}</h3><p className="muted">{new Date(report.created_at).toLocaleString()} · {report.reason==='user'?'主动结束':'视频结束'} · 练习包 {report.package_id.slice(0,8)}</p><p>已完成 {report.counts.completed} · 揭晓 {report.counts.revealed} · 未做题 {report.counts.unfinished}</p><button aria-label={`打开报告 ${report.id.slice(0,8)}`} onClick={()=>onOpen(report.id)}>打开报告</button></article>)}</section>
}
