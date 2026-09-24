import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ImageOff, X } from "lucide-react";
import type { ListingCapture } from "./api";

export type ListingPhotoSelection = { capture: ListingCapture; index: number };
type OnPhoto = (selection: ListingPhotoSelection) => void;

export function ListingCapturePreview({capture, onPhoto}: {capture: ListingCapture; onPhoto: OnPhoto}) {
  return <section className="ba-listing-capture" aria-label="Captured product photos">
    <header><strong>Product photos</strong><span>{capture.image_urls.length} captured</span>
      <button onClick={()=>onPhoto({capture,index:0})}>View photos<ChevronRight size={13}/></button></header>
    {capture.title&&<p className="ba-listing-title">{capture.title}</p>}
    <p className="ba-listing-meta"><time dateTime={capture.captured_at}>Captured {new Date(capture.captured_at).toLocaleString()}</time>
      {capture.text_captured===true&&<span> · Listing text captured</span>}</p>
    <div className="ba-captures">{capture.image_urls.slice(0,3).map((url,index)=><ProductPhoto key={url}
      url={url} index={index} onClick={()=>onPhoto({capture,index})}/>)}</div>
  </section>;
}

function ProductPhoto({url,index,onClick}: {url:string;index:number;onClick:()=>void}) {
  const [failed,setFailed]=useState(false);
  return <button className="ba-capture ba-product-photo" onClick={onClick} aria-label={`Open product photo ${index+1}`}>
    {failed?<span className="ba-capture-placeholder"><ImageOff size={20}/>Photo unavailable</span>
      :<img src={url} alt={`Product photo ${index+1}`} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={()=>setFailed(true)}/>}
    <span><strong>Product photo {index+1}</strong></span>
  </button>;
}

export function ListingPhotoViewer({selection,onClose}: {selection:ListingPhotoSelection;onClose:()=>void}) {
  const {capture}=selection;
  const [index,setIndex]=useState(selection.index);
  const [failedUrl,setFailedUrl]=useState<string|null>(null);
  const ref=useRef<HTMLDialogElement>(null);
  const url=capture.image_urls[index];
  useEffect(()=>{
    const dialog=ref.current;dialog?.showModal();
    return ()=>dialog?.close();
  },[]);
  return <dialog ref={ref} className="ba-viewer ba-photo-viewer" aria-labelledby="ba-photo-title"
    onClose={event=>{if(!event.currentTarget.open)onClose();}}
    onClick={event=>{if(event.target===event.currentTarget)onClose();}}
    onKeyDown={event=>{
      if(event.key==="ArrowLeft"){event.preventDefault();setIndex(value=>Math.max(0,value-1));}
      if(event.key==="ArrowRight"){event.preventDefault();setIndex(value=>Math.min(capture.image_urls.length-1,value+1));}
    }}>
    <div><header><div><h2 id="ba-photo-title">Product photo {index+1} of {capture.image_urls.length}</h2>
      <p>{capture.worker_id} · {new Date(capture.captured_at).toLocaleString()}</p></div>
      <button autoFocus onClick={onClose} aria-label="Close product photos"><X size={20}/></button></header>
      {capture.title&&<p className="ba-photo-title">{capture.title}</p>}
      {failedUrl===url?<p className="ba-viewer-message" role="status"><ImageOff size={24}/>This product photo could not be loaded from the source.</p>
        :<img key={url} src={url} alt={capture.title?`${capture.title}, product photo ${index+1}`:`Product photo ${index+1}`}
          referrerPolicy="no-referrer" onError={()=>setFailedUrl(url)}/>}
      <nav aria-label="Product photos"><button onClick={()=>setIndex(value=>value-1)} disabled={index===0} aria-label="Previous product photo"><ChevronLeft size={18}/>Previous</button>
        <span aria-live="polite">{index+1} / {capture.image_urls.length}</span>
        <button onClick={()=>setIndex(value=>value+1)} disabled={index===capture.image_urls.length-1} aria-label="Next product photo">Next<ChevronRight size={18}/></button></nav>
      <p className="ba-viewer-url">{capture.page_url}</p>
    </div>
  </dialog>;
}
