import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

export function LegalReviewDialog({initialQuestion = "", onConfirm, onCancel}: {
  initialQuestion?: string; onConfirm: (question: string) => Promise<void>; onCancel: () => void;
}) {
  const [question,setQuestion]=useState(initialQuestion),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const input=useRef<HTMLTextAreaElement>(null),panel=useRef<HTMLFormElement>(null),id=useId();
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow;
    document.body.style.overflow="hidden";
    input.current?.focus();
    return ()=>{document.body.style.overflow=overflow;previous?.focus();};
  },[]);
  async function submit() {
    if(busy||question.trim().length<10)return;
    setBusy(true);setError("");
    try{await onConfirm(question.trim());}
    catch(caught){setError(caught instanceof Error?caught.message:"Could not request legal review.");setBusy(false);}
  }
  return createPortal(<div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4"
    onClick={()=>{if(!busy)onCancel();}} onKeyDown={event=>{
      event.stopPropagation();
      if(event.key==="Escape"&&!busy){event.preventDefault();onCancel();}
      if(event.key==="Tab"){
        const controls=Array.from(panel.current?.querySelectorAll<HTMLElement>('textarea:not(:disabled),button:not(:disabled)')??[]);
        const first=controls[0],last=controls.at(-1);
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
      }
    }}>
    <form ref={panel} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}
      className="w-full max-w-lg rounded-2xl border border-stone-200 bg-white shadow-xl"
      onClick={event=>event.stopPropagation()} onSubmit={event=>{event.preventDefault();void submit();}}>
      <div className="border-b border-stone-100 px-5 py-4"><h2 id={`${id}-title`} className="text-base font-semibold text-stone-900">Request legal review</h2></div>
      <div className="space-y-3 px-5 py-4">
        <p id={`${id}-description`} className="text-sm leading-6 text-stone-600">Describe the legal question that remains after checking the evidence and customer policy. Missing photos or an uncertain product match should go through investigation first.</p>
        <label htmlFor={`${id}-question`} className="block text-xs font-semibold text-stone-800">Question for the lawyer</label>
        <textarea ref={input} id={`${id}-question`} value={question} disabled={busy} rows={4} minLength={10} maxLength={2000} required
          onChange={event=>setQuestion(event.target.value)} placeholder="Which rule applies to this offer, and what remains unresolved?"
          className="w-full resize-y rounded-xl border border-stone-300 px-3 py-2 text-sm leading-6 text-stone-900 focus:border-stone-500 focus:outline-none focus:ring-2 focus:ring-stone-200" />
        {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
      </div>
      <div className="flex justify-end gap-2 border-t border-stone-100 px-5 py-4">
        <button type="button" disabled={busy} onClick={onCancel} className="rounded-lg border border-stone-200 px-3 py-2 text-sm font-medium text-stone-700 disabled:opacity-50">Cancel</button>
        <button type="submit" disabled={busy||question.trim().length<10} className="rounded-lg bg-stone-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-40">{busy?"Requesting...":"Request legal review"}</button>
      </div>
    </form>
  </div>,document.body);
}
