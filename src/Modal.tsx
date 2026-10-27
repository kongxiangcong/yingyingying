import {useEffect,useRef,type ReactNode} from 'react';
export function Modal({title,onClose,children,busy=false}:{title:string;onClose:()=>void;children:ReactNode;busy?:boolean}){
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const opener=document.activeElement as HTMLElement|null;ref.current?.showModal();return()=>{ref.current?.close();opener?.focus()}},[]);
 return <dialog ref={ref} className="app-dialog" aria-label={title} onCancel={event=>{event.preventDefault();if(!busy)onClose()}}><div className="dialog-heading"><h2>{title}</h2><button type="button" className="icon-button" aria-label="关闭窗口" disabled={busy} onClick={onClose}>×</button></div>{children}</dialog>
}
