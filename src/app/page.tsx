"use client";

import { useState, useEffect, useRef, useCallback, useId } from "react";
import {
  Film, Captions, Sparkles, Bot, Activity, Settings,
  FolderOpen, Play, Square, RefreshCw,
  CheckSquare, Square as Sq, ChevronDown,
  X, AlertCircle, CheckCircle, Info, Zap, Download, Wand2,
  FileOutput, ArrowRight, Clock, Copy, Check,
  Terminal, Package, Cpu, Shield,
  Mic2, Languages, Gauge, Volume2, Clapperboard, TrendingUp,
} from "lucide-react";

// ─── Palette ──────────────────────────────────────────────────────────────────
const C = {
  // Surfaces — deep space black with cold blue undertone
  bgDeep:   "#05060A",   // deepest well
  bgBase:   "#08090E",   // app root
  bgSide:   "#06070C",   // sidebar — 2 stops darker
  bgCard:   "#0C0E14",   // glass cards
  bgRaised: "#111620",   // hover / elevated
  bgInput:  "#0A0C12",   // input wells

  // Text — cinematic white hierarchy
  t1: "#F0F4F8",   // primary — near white
  t2: "#7A8FA8",   // secondary — blue-grey
  t3: "#3D5065",   // muted
  t4: "#162030",   // faint dividers

  // RED — primary brand accent (Tesla-inspired)
  re:  "#FF2020",   // core red
  reL: "#FF5050",   // lighter / hover
  reD: "#CC1010",   // darker / pressed
  reA: "rgba(255,32,32,0.08)",
  reB: "rgba(255,32,32,0.18)",
  reG: "rgba(255,32,32,0.30)",

  // Cyan — processing accent (feature color, not brand)
  cy:  "#00C9F0",
  cyL: "#33D6F5",
  cyD: "#0099BB",
  cyA: "rgba(0,201,240,0.07)",
  cyB: "rgba(0,201,240,0.14)",
  cyG: "rgba(0,201,240,0.24)",

  // Gold — dub / remaster premium
  gd:  "#E8A800",
  gdL: "#F0BC33",
  gdA: "rgba(232,168,0,0.07)",
  gdB: "rgba(232,168,0,0.18)",

  // Semantic
  ok:  "#00C896",
  okA: "rgba(0,200,150,0.07)",
  okB: "rgba(0,200,150,0.18)",
  er:  "#FF4040",
  erA: "rgba(255,64,64,0.07)",
  erB: "rgba(255,64,64,0.18)",
  wa:  "#F0920A",

  // Borders — liquid glass system
  bd:  "rgba(255,255,255,0.055)",   // default
  bdC: "rgba(0,201,240,0.10)",      // cyan-tinted
  bdR: "rgba(255,32,32,0.14)",      // red-tinted
  // Glass tokens
  gl:  "rgba(255,255,255,0.035)",   // glass fill
  glB: "rgba(255,255,255,0.07)",    // glass border
  glS: "rgba(255,255,255,0.055)",   // glass shine (top edge)
} as const;

const ease = {
  out:    "cubic-bezier(0.23, 1, 0.32, 1)",
  expo:   "cubic-bezier(0.19, 1, 0.22, 1)",
  spring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
} as const;

// ─── Liquid Glass style helper ────────────────────────────────────────────────
const glass = (opacity = 0.035, blur = 24): React.CSSProperties => ({
  background: `rgba(255,255,255,${opacity})`,
  backdropFilter: `blur(${blur}px) saturate(180%)`,
  WebkitBackdropFilter: `blur(${blur}px) saturate(180%)`,
  border: `1px solid rgba(255,255,255,${opacity * 2})`,
  boxShadow: `0 4px 24px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,${opacity * 1.5})`,
});

// ─── Types ────────────────────────────────────────────────────────────────────
interface MediaFile { path:string;name:string;ext:string;size:number;selected:boolean;hasSrt:boolean; }
interface Job { id:string;name:string;type:"convert"|"subtitles"|"dub"|"remaster"|"interpolate"|"automate";status:"pending"|"running"|"done"|"error"|"cancelled";progress:number;log:string[];startTime:number;error?:string; }
interface Toast { id:string;kind:"success"|"error"|"info"|"warn";title:string;body?:string;exiting?:boolean; }
interface ProgressData { jobId:string;progress:number;log:string;status:Job["status"];error?:string; }
interface AutomationRules { autoConvert:boolean;autoSubs:boolean;autoTranslate:boolean;autoDub:boolean; }
interface RemasterOpts { model:"general"|"anime"|"face"|"film";targetRes:"fhd"|"4k"|"8k";denoiseLevel:number;colorRestore:boolean;scratchRemoval:boolean;hdr:boolean; }
interface OutputSettings { location:"alongside"|"custom";customPath:string;openWhenDone:boolean;keepOriginal:boolean; }
interface DepStatus { ffmpeg:boolean;whisper:boolean;esrgan:boolean;basicsr:boolean; }
interface DubDeps { whisper:boolean;demucs:boolean;tts:boolean;transformers:boolean;argos:boolean;soundfile:boolean;librosa:boolean; }
interface Language { code:string;name:string;nativeName:string; }
type TabId = "convert"|"subtitles"|"dub"|"remaster"|"interpolate"|"automate"|"jobs"|"settings";
type ScanState = "idle"|"scanning"|"done"|"error";

declare global {
  interface Window {
    electronAPI?:{
      // Setup wizard
      isFirstLaunch:     ()=>Promise<boolean>;
      markSetupComplete: ()=>Promise<void>;
      resetSetup:        ()=>Promise<void>;
      getSystemInfo:     ()=>Promise<SysInfo>;
      checkAllDeps:      ()=>Promise<CheckResult>;
      installTools:      (tools:string[])=>Promise<void>;
      onSetupProgress:   (cb:(d:{msg:string;status:string})=>void)=>void;
      // Main app
      scanFolder:        (p:string)=>Promise<MediaFile[]>;
      selectFolder:      ()=>Promise<string|null>;
      selectOutputDir:   ()=>Promise<string|null>;
      selectFile:        (opts:{title:string;filters:{name:string;extensions:string[]}[]})=>Promise<string|null>;
      convertFiles:      (f:string[],fmt:string,codec:string,out:OutputSettings,id:string)=>Promise<void>;
      generateSubs:      (f:string[],model:string,lang:string,tgtLang:string,tr:boolean,burn:boolean,out:OutputSettings,id:string)=>Promise<void>;
      dubFiles:          (f:string[],srcLang:string,tgtLang:string,wModel:string,preserveBg:boolean,lipSync:boolean,quality:string,out:OutputSettings,id:string)=>Promise<void>;
      checkDubDeps:      ()=>Promise<DubDeps>;
      remasterFiles:     (f:string[],opts:RemasterOpts,out:OutputSettings,id:string)=>Promise<void>;
      interpolateFiles:  (f:string[],multiplier:number,method:string,out:OutputSettings,id:string)=>Promise<void>;
      runAutomation:     (rules:AutomationRules,folder:string,out:OutputSettings,id:string)=>Promise<void>;
      cancelJob:         (id:string)=>Promise<void>;
      checkDeps:         ()=>Promise<DepStatus>;
      onProgress:        (cb:(d:ProgressData)=>void)=>void;
      removeListeners:   ()=>void;
    };
  }
}

const isEl = () => typeof window !== "undefined" && !!window.electronAPI;
const fmtSize = (b:number) => b<1_048_576?`${(b/1024).toFixed(0)} KB`:b<1_073_741_824?`${(b/1_048_576).toFixed(1)} MB`:`${(b/1_073_741_824).toFixed(2)} GB`;
const fmtEl = (ms:number) => { const s=Math.floor(ms/1000); if(s<60) return `${s}s`; const m=Math.floor(s/60); return m<60?`${m}m ${s%60}s`:`${Math.floor(m/60)}h ${m%60}m`; };
const NON_MP4 = new Set(["mkv","avi","mov","wmv","flv","webm","m4v","ts","m2ts"]);
const DOUT:OutputSettings = {location:"alongside",customPath:"",openWhenDone:false,keepOriginal:true};
const MOCK:MediaFile[] = [
  {path:"/demo/Tokyo.Drift.mkv",    name:"Tokyo.Drift.mkv",    ext:"mkv",  size:14_200_000_000,selected:false,hasSrt:false},
  {path:"/demo/Oppenheimer.avi",    name:"Oppenheimer.avi",    ext:"avi",  size:8_700_000_000, selected:false,hasSrt:true},
  {path:"/demo/Interview.mp4",      name:"Interview.mp4",      ext:"mp4",  size:2_400_000_000, selected:false,hasSrt:false},
  {path:"/demo/AnimeS01E01.webm",   name:"AnimeS01E01.webm",   ext:"webm", size:1_100_000_000, selected:false,hasSrt:false},
  {path:"/demo/Concert.mkv",        name:"Concert.mkv",        ext:"mkv",  size:6_300_000_000, selected:false,hasSrt:false},
];

// ─── Toast hook ───────────────────────────────────────────────────────────────
function useToasts() {
  const [ts,setTs]=useState<Toast[]>([]);
  const dismiss=useCallback((id:string)=>{ setTs(t=>t.map(x=>x.id===id?{...x,exiting:true}:x)); setTimeout(()=>setTs(t=>t.filter(x=>x.id!==id)),200); },[]);
  const push=useCallback((t:Omit<Toast,"id">)=>{ const id=Date.now().toString(); setTs(p=>[...p,{...t,id}]); setTimeout(()=>dismiss(id),4500); },[dismiss]);
  return {toasts:ts,push,dismiss};
}

// ─── Style helpers ────────────────────────────────────────────────────────────
const T = {
  fast:  `transform 160ms ${ease.out}, opacity 160ms ${ease.out}`,
  press: `transform 120ms ${ease.out}`,
  col:   `background 200ms ${ease.out}, border-color 200ms ${ease.out}`,
};

function usePressable() {
  const [pressed, setPressed] = useState(false);
  return {
    pressed,
    handlers: {
      onMouseDown: () => setPressed(true),
      onMouseUp:   () => setPressed(false),
      onMouseLeave:() => setPressed(false),
    },
  };
}

// Primary button — red brand color
function PBtn({ children, onClick, disabled, style }:{ children:React.ReactNode;onClick?:()=>void;disabled?:boolean;style?:React.CSSProperties }) {
  const {pressed,handlers}=usePressable();
  return (
    <button
      {...handlers}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        display:"inline-flex",alignItems:"center",justifyContent:"center",gap:7,
        padding:"10px 20px",borderRadius:9,
        background: pressed?"#CC1010":"linear-gradient(135deg,#CC1010,#FF2020,#FF3030)",
        color:"#FFFFFF",fontWeight:700,fontSize:12,letterSpacing:"0.04em",
        textTransform:"uppercase" as const,
        cursor: disabled ? "not-allowed" : "pointer",
        border:"1px solid rgba(255,32,32,0.5)",
        boxShadow: pressed
          ? "inset 0 2px 8px rgba(0,0,0,0.4)"
          : "inset 0 1px 0 rgba(255,100,100,0.25), 0 2px 8px rgba(255,32,32,0.2), 0 1px 3px rgba(0,0,0,0.4)",
        transform: pressed ? "scale(0.97) translateY(1px)" : "scale(1) translateY(0)",
        transition: `transform 120ms ${ease.out}, box-shadow 120ms ${ease.out}, background 120ms ${ease.out}`,
        opacity: disabled ? 0.35 : 1,
        pointerEvents: "auto" as const,
        userSelect:"none" as const,
        fontFamily:"Inter,ui-sans-serif,-apple-system,sans-serif",
        ...style,
      }}
    >{children}</button>
  );
}

// Ghost button
function GBtn({ children, onClick, style }:{ children:React.ReactNode;onClick?:()=>void;style?:React.CSSProperties }) {
  const {pressed,handlers}=usePressable();
  return (
    <button
      {...handlers} onClick={onClick}
      style={{
        display:"inline-flex",alignItems:"center",justifyContent:"center",gap:6,
        padding:"6px 12px",borderRadius:6,
        background: C.cyA,color:C.t2,fontSize:11,fontWeight:500,
        cursor:"pointer",border:`1px solid ${C.bdC}`,
        transform: pressed?"scale(0.97)":"scale(1)",transition:T.press,
        userSelect:"none" as const,
        ...style,
      }}
    >{children}</button>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function Sk({w="100%",h=12}:{w?:string|number;h?:number}) {
  return <div style={{width:w,height:h,borderRadius:4,background:"linear-gradient(90deg,rgba(0,201,240,0.03) 25%,rgba(0,201,240,0.09) 50%,rgba(0,201,240,0.03) 75%)",backgroundSize:"400% 100%",animation:"shimmer 1.8s linear infinite"}}/>;
}

// ─── Toggle ───────────────────────────────────────────────────────────────────
function Toggle({on,onChange}:{on:boolean;onChange:(v:boolean)=>void}) {
  return (
    <div onClick={()=>onChange(!on)} role="switch" aria-checked={on} tabIndex={0}
      onKeyDown={e=>{if(e.key===" "||e.key==="Enter"){e.preventDefault();onChange(!on);}}}
      style={{
        position:"relative",width:36,height:20,borderRadius:99,cursor:"pointer",flexShrink:0,
        background: on?"#009AB5":"rgba(255,255,255,0.07)",
        border:`1px solid ${on?"rgba(0,201,240,0.5)":"rgba(255,255,255,0.1)"}`,
        boxShadow: on?"inset 0 1px 0 rgba(0,201,240,0.2)":"inset 0 1px 0 rgba(255,255,255,0.04)",
        transition:`background 200ms ${ease.out}, border-color 200ms ${ease.out}`,
      }}>
      <div style={{
        position:"absolute",top:2,left:2,width:14,height:14,borderRadius:"50%",
        background: on?"#E2F8FC":"rgba(255,255,255,0.45)",
        boxShadow: on?"0 1px 3px rgba(0,0,0,0.4)":"0 1px 2px rgba(0,0,0,0.3)",
        transform: on?"translateX(16px)":"translateX(0)",
        transition:`transform 220ms ${ease.spring}`,
      }}/>
    </div>
  );
}

// ─── Checkbox ─────────────────────────────────────────────────────────────────
function Chk({checked}:{checked:boolean}) {
  return (
    <div style={{
      width:15,height:15,borderRadius:3,flexShrink:0,
      display:"flex",alignItems:"center",justifyContent:"center",
      background: checked?"#00C9F0":"transparent",
      border:`1.5px solid ${checked?"#00C9F0":"rgba(0,201,240,0.25)"}`,
      boxShadow: checked?"inset 0 1px 0 rgba(255,255,255,0.2)":"none",
      transition:`background 150ms ${ease.out}, border-color 150ms ${ease.out}`,
    }}>
      {checked&&<svg width="8" height="6" viewBox="0 0 8 6" fill="none"><path d="M1 3L3 5L7 1" stroke="#000B10" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
    </div>
  );
}

// ─── Section label — Caption scale (9px/700/+0.12em/uppercase) ────────────────
function SL({children,style}:{children:React.ReactNode;style?:React.CSSProperties}) {
  return (
    <div style={{
      fontSize:9,fontWeight:700,letterSpacing:"0.12em",
      textTransform:"uppercase" as const,color:C.t3,marginBottom:10,
      fontFamily:"Inter,ui-sans-serif,-apple-system,sans-serif",
      ...style,
    }}>{children}</div>
  );
}

// ─── Copy-able code block ─────────────────────────────────────────────────────
function CodeBlock({cmd}:{cmd:string}) {
  const [copied,setCopied]=useState(false);
  const copy=()=>{
    navigator.clipboard?.writeText(cmd).then(()=>{ setCopied(true); setTimeout(()=>setCopied(false),2000); });
  };
  return (
    <div style={{position:"relative",padding:"8px 40px 8px 11px",borderRadius:6,background:C.bgDeep,border:`1px solid ${C.bd}`,boxShadow:"inset 0 1px 3px rgba(0,0,0,0.2)",color:C.t2,fontSize:10,fontFamily:"'SF Mono',Menlo,monospace",wordBreak:"break-all" as const}}>
      {cmd}
      <button onClick={copy} title="Copy" style={{
        position:"absolute",right:7,top:"50%",transform:"translateY(-50%)",
        background:"none",border:"none",cursor:"pointer",color:copied?C.ok:C.t3,padding:2,
        display:"flex",alignItems:"center",
      }}>
        {copied ? <Check size={11}/> : <Copy size={11}/>}
      </button>
    </div>
  );
}

// ─── Field select ─────────────────────────────────────────────────────────────
function Sel({label,value,onChange,options}:{label:string;value:string;onChange:(v:string)=>void;options:{value:string;label:string}[]}) {
  const id=useId();
  return (
    <div>
      {label&&<div id={id} style={{fontSize:9,fontWeight:700,letterSpacing:"0.12em",textTransform:"uppercase" as const,color:C.t3,marginBottom:6}}>{label}</div>}
      <div style={{position:"relative"}}>
        <select
          aria-labelledby={id} value={value} onChange={e=>onChange(e.target.value)}
          style={{
            appearance:"none",background:C.bgInput,border:`1px solid ${C.bdC}`,
            borderRadius:7,color:C.t2,fontSize:12,fontFamily:"inherit",
            padding:"8px 30px 8px 11px",width:"100%",cursor:"pointer",outline:"none",
            boxShadow:"inset 0 1px 3px rgba(0,0,0,0.2)",
          }}>
          {options.map(o=><option key={o.value} value={o.value} style={{background:C.bgRaised}}>{o.label}</option>)}
        </select>
        <ChevronDown size={11} style={{position:"absolute",right:9,top:"50%",transform:"translateY(-50%)",pointerEvents:"none",color:C.t3}}/>
      </div>
    </div>
  );
}

// ─── Dep warning banner ───────────────────────────────────────────────────────
function DepWarn({missing,onGoSettings}:{missing:string;onGoSettings:()=>void}) {
  return (
    <div style={{display:"flex",alignItems:"center",gap:9,padding:"9px 12px",borderRadius:9,background:C.reA,border:`1px solid ${C.reB}`,marginBottom:4,boxShadow:"inset 0 1px 0 rgba(255,32,32,0.06)"}}>
      <AlertCircle size={13} style={{color:C.re,flexShrink:0}}/>
      <span style={{flex:1,fontSize:12,fontWeight:500,color:C.t2}}><span style={{color:C.reL,fontWeight:600}}>{missing}</span> not installed</span>
      <GBtn onClick={onGoSettings} style={{padding:"3px 9px",fontSize:10,gap:3,color:C.re,borderColor:C.reB}}>Fix <ArrowRight size={9}/></GBtn>
    </div>
  );
}

// ─── File list ────────────────────────────────────────────────────────────────
function FileList({files,scanState,onToggle,onSelectAll,onSelectExt,onOpen,showSrt=false}:{
  files:MediaFile[];scanState:ScanState;onToggle:(p:string)=>void;onSelectAll:(v:boolean)=>void;
  onSelectExt?:(e:string)=>void;onOpen?:()=>void;showSrt?:boolean;
}) {
  const extC=(e:string):string => e==="mp4"?C.ok:e==="mkv"?C.cy:e==="avi"?C.wa:C.cyL;
  const extBg=(e:string):string => e==="mp4"?C.okA:e==="mkv"?C.cyA:e==="avi"?`rgba(224,144,32,0.08)`:C.cyA;

  if(scanState==="scanning") return (
    <div style={{display:"flex",flexDirection:"column",gap:8,padding:"4px 0"}}>
      {[88,72,80,65,75].map((w,i)=>(
        <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 0"}}>
          <Sk w={15} h={15}/><Sk w={`${w}%`} h={11}/><Sk w={36} h={11}/>
        </div>
      ))}
    </div>
  );

  if(scanState==="idle"||scanState==="error") return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"flex-start",gap:16,padding:"32px 0"}}>
      <div style={{
        width:48,height:48,borderRadius:12,background:C.cyA,border:`1px solid ${C.cyB}`,
        boxShadow:"inset 0 1px 0 rgba(0,201,240,0.1)",display:"flex",alignItems:"center",justifyContent:"center",
      }}>
        <FolderOpen size={22} style={{color:C.cy}}/>
      </div>
      <div>
        <div style={{fontSize:14,fontWeight:600,color:C.t1,marginBottom:4,letterSpacing:"-0.02em"}}>
          {scanState==="error"?"Cannot read folder":"Select a media folder"}
        </div>
        <div style={{fontSize:12,color:C.t2,lineHeight:1.5}}>
          {scanState==="error"?"Check folder permissions and try again":"Open a folder containing your video files."}
        </div>
      </div>
      {onOpen&&<PBtn onClick={onOpen} style={{padding:"8px 16px",fontSize:11}}><FolderOpen size={12}/>Open Folder</PBtn>}
    </div>
  );

  if(!files.length) return (
    <div style={{padding:"24px 0",fontSize:12,color:C.t3}}>No video files found in this folder.</div>
  );

  const allSel=files.every(f=>f.selected);
  const selN=files.filter(f=>f.selected).length;
  const exts=[...new Set(files.map(f=>f.ext))].filter(e=>NON_MP4.has(e));

  return (
    <div style={{display:"flex",flexDirection:"column",gap:6}}>
      <div style={{display:"flex",alignItems:"center",gap:8,paddingBottom:6,borderBottom:`1px solid ${C.bd}`}}>
        <GBtn onClick={()=>onSelectAll(!allSel)} style={{gap:5,padding:"4px 9px"}}>
          {allSel?<CheckSquare size={11} style={{color:C.cy}}/>:<Sq size={11}/>}
          <span style={{fontSize:10}}>{allSel?"Deselect all":"Select all"}</span>
        </GBtn>
        {onSelectExt&&exts.map(ext=>(
          <GBtn key={ext} onClick={()=>onSelectExt(ext)} style={{padding:"3px 8px"}}>
            <span style={{fontFamily:"monospace",fontSize:10,color:C.cyL}}>·{ext}</span>
          </GBtn>
        ))}
        <span style={{marginLeft:"auto",fontSize:10,color:C.t3,fontVariantNumeric:"tabular-nums"}}>
          {selN>0?`${selN} / ${files.length} selected`:`${files.length} files`}
        </span>
      </div>

      <div style={{maxHeight:200,overflowY:"auto",display:"flex",flexDirection:"column"}}>
        {files.map((f,i)=>(
          <div key={f.path}
            onClick={()=>onToggle(f.path)} role="checkbox" aria-checked={f.selected} tabIndex={0}
            onKeyDown={e=>{if(e.key===" "){e.preventDefault();onToggle(f.path);}}}
            style={{
              display:"flex",alignItems:"center",gap:10,
              padding:"9px 10px",cursor:"pointer",
              borderTop: i>0?`1px solid ${C.bd}`:"none",
              background: f.selected?C.cyA:"transparent",
              borderRadius: f.selected?6:0,
              transition:`background 120ms ${ease.out}`,
            }}>
            <Chk checked={f.selected}/>
            <span style={{flex:1,fontSize:12,color:f.selected?C.t1:C.t2,fontWeight:f.selected?500:400,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
              {f.name}
            </span>
            <span style={{fontSize:9,fontWeight:700,letterSpacing:"0.07em",textTransform:"uppercase" as const,padding:"2px 5px",borderRadius:4,background:extBg(f.ext),color:extC(f.ext),border:`1px solid ${extC(f.ext)}22`,flexShrink:0}}>{f.ext}</span>
            <span style={{fontSize:10,color:C.t3,flexShrink:0,minWidth:50,textAlign:"right" as const,fontVariantNumeric:"tabular-nums"}}>{fmtSize(f.size)}</span>
            {showSrt&&<span style={{fontSize:9,fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase" as const,padding:"2px 5px",borderRadius:4,background:f.hasSrt?C.okA:C.bdC,color:f.hasSrt?C.ok:C.t3,flexShrink:0}}>{f.hasSrt?"SRT":"—"}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Output strip ─────────────────────────────────────────────────────────────
function OutStrip({s,onGo}:{s:OutputSettings;onGo:()=>void}) {
  return (
    <div style={{display:"flex",alignItems:"center",gap:8,padding:"6px 10px",borderRadius:6,background:C.cyA,border:`1px solid ${C.bdC}`,fontSize:11}}>
      <FileOutput size={10} style={{color:C.cy,flexShrink:0}}/>
      <span style={{flex:1,color:C.t3}}>
        Output: <span style={{color:C.cy,fontWeight:600}}>{s.location==="alongside"?"alongside source file":s.customPath||"custom folder"}</span>
      </span>
      <GBtn onClick={onGo} style={{padding:"2px 7px",fontSize:10,gap:3}}>
        Change <ArrowRight size={9} style={{color:C.cy}}/>
      </GBtn>
    </div>
  );
}

// ─── Tab: Convert ─────────────────────────────────────────────────────────────
function ConvertTab({files,scanState,onOpen,out,onJob,onGoSettings,toast,deps}:{
  files:MediaFile[];scanState:ScanState;onOpen:()=>void;out:OutputSettings;
  onJob:(j:Job)=>void;onGoSettings:()=>void;toast:(t:Omit<Toast,"id">)=>void;deps:DepStatus|null;
}) {
  const [fmt,setFmt]=useState("mp4");
  const [codec,setCodec]=useState("libx264");
  const [lf,setLf]=useState<MediaFile[]>([]);
  useEffect(()=>{setLf(files.map(f=>({...f,selected:false})));}, [files]);
  const toggle=(p:string)=>setLf(f=>f.map(x=>x.path===p?{...x,selected:!x.selected}:x));
  const selAll=(v:boolean)=>setLf(f=>f.map(x=>({...x,selected:v})));
  const selExt=(e:string)=>setLf(f=>f.map(x=>({...x,selected:x.ext===e})));
  const sel=lf.filter(f=>f.selected);
  const nonMp4=lf.filter(f=>NON_MP4.has(f.ext));

  const go=(targets:string[],label:string)=>{
    if(!targets.length) return;
    const id=Date.now().toString();
    onJob({id,name:`${label} → .${fmt.toUpperCase()}`,type:"convert",status:"running",progress:0,log:[],startTime:Date.now()});
    toast({kind:"info",title:"Converting",body:`${targets.length} file${targets.length>1?"s":""} → .${fmt.toUpperCase()}`});
    if(isEl()) window.electronAPI!.convertFiles(targets,fmt,codec,out,id);
  };

  return (
    <div style={{display:"flex",flexDirection:"column",gap:20,animation:"enter 220ms cubic-bezier(0.23,1,0.32,1) both"}}>
      {deps&&!deps.ffmpeg&&<DepWarn missing="ffmpeg" onGoSettings={onGoSettings}/>}

      {nonMp4.length>0&&scanState==="done"&&(
        <div style={{
          padding:"16px 18px",borderRadius:10,background:C.cyA,
          border:`1px solid ${C.cyB}`,boxShadow:"inset 0 1px 0 rgba(0,201,240,0.08)",
          display:"flex",alignItems:"center",gap:14,
        }}>
          <div style={{width:40,height:40,borderRadius:10,background:C.bgCard,border:`1px solid ${C.cyB}`,boxShadow:"inset 0 1px 0 rgba(0,201,240,0.1)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
            <Wand2 size={18} style={{color:C.cy}}/>
          </div>
          <div style={{flex:1}}>
            <div style={{fontSize:13,fontWeight:600,color:C.t1,letterSpacing:"-0.02em"}}>Convert all non-MP4 → MP4</div>
            <div style={{fontSize:11,color:C.t2,marginTop:2}}>
              <span style={{color:C.cy,fontWeight:600,fontVariantNumeric:"tabular-nums"}}>{nonMp4.length}</span> files · H.264 · universal playback
            </div>
          </div>
          <PBtn onClick={()=>go(nonMp4.map(f=>f.path),"All non-MP4")} style={{padding:"8px 16px",fontSize:11}}>
            <Zap size={12}/>Convert All
          </PBtn>
        </div>
      )}

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <Sel label="Output Format" value={fmt} onChange={v=>{setFmt(v);setCodec(v==="webm"?"libvpx-vp9":"libx264");}} options={[
          {value:"mp4",label:"MP4"},{value:"mkv",label:"MKV"},
          {value:"mov",label:"MOV"},{value:"avi",label:"AVI"},{value:"webm",label:"WebM"},
        ]}/>
        <Sel label="Video Codec" value={codec} onChange={setCodec} options={
          fmt==="webm"?[{value:"libvpx-vp9",label:"VP9"}]:
          [{value:"libx264",label:"H.264 — Universal"},{value:"libx265",label:"H.265 — Smaller"},{value:"copy",label:"Stream copy (no re-encode)"}]
        }/>
      </div>

      <OutStrip s={out} onGo={onGoSettings}/>

      <div>
        <SL>Select Files to Convert</SL>
        <FileList files={lf} scanState={scanState} onToggle={toggle} onSelectAll={selAll} onSelectExt={selExt} onOpen={onOpen}/>
      </div>

      <div>
        <PBtn onClick={()=>go(sel.map(f=>f.path),"Convert")} disabled={!sel.length} style={{width:"100%",padding:"11px",fontSize:12,borderRadius:9}}>
          <Play size={13}/>
          {sel.length>0?`Convert ${sel.length} File${sel.length>1?"s":""}` :"Select Files to Convert"}
        </PBtn>
        {!sel.length&&scanState==="done"&&files.length>0&&(
          <div style={{marginTop:6,fontSize:10,color:C.t3,textAlign:"center" as const}}>Check files above, then click Convert</div>
        )}
      </div>
    </div>
  );
}

// ─── Languages ────────────────────────────────────────────────────────────────
const LANGUAGES:Language[]=[
  {code:"en",name:"English",      nativeName:"English"},
  {code:"es",name:"Spanish",      nativeName:"Español"},
  {code:"fr",name:"French",       nativeName:"Français"},
  {code:"de",name:"German",       nativeName:"Deutsch"},
  {code:"it",name:"Italian",      nativeName:"Italiano"},
  {code:"pt",name:"Portuguese",   nativeName:"Português"},
  {code:"ru",name:"Russian",      nativeName:"Русский"},
  {code:"ja",name:"Japanese",     nativeName:"日本語"},
  {code:"ko",name:"Korean",       nativeName:"한국어"},
  {code:"zh",name:"Chinese",      nativeName:"中文"},
  {code:"ar",name:"Arabic",       nativeName:"العربية"},
  {code:"hi",name:"Hindi",        nativeName:"हिन्दी"},
  {code:"nl",name:"Dutch",        nativeName:"Nederlands"},
  {code:"sv",name:"Swedish",      nativeName:"Svenska"},
  {code:"pl",name:"Polish",       nativeName:"Polski"},
  {code:"tr",name:"Turkish",      nativeName:"Türkçe"},
  {code:"vi",name:"Vietnamese",   nativeName:"Tiếng Việt"},
  {code:"th",name:"Thai",         nativeName:"ภาษาไทย"},
  {code:"id",name:"Indonesian",   nativeName:"Bahasa Indonesia"},
  {code:"uk",name:"Ukrainian",    nativeName:"Українська"},
  {code:"he",name:"Hebrew",       nativeName:"עברית"},
  {code:"fa",name:"Persian",      nativeName:"فارسی"},
  {code:"cs",name:"Czech",        nativeName:"Čeština"},
  {code:"ro",name:"Romanian",     nativeName:"Română"},
  {code:"hu",name:"Hungarian",    nativeName:"Magyar"},
  {code:"fi",name:"Finnish",      nativeName:"Suomi"},
  {code:"da",name:"Danish",       nativeName:"Dansk"},
  {code:"no",name:"Norwegian",    nativeName:"Norsk"},
  {code:"bg",name:"Bulgarian",    nativeName:"Български"},
  {code:"hr",name:"Croatian",     nativeName:"Hrvatski"},
  {code:"sk",name:"Slovak",       nativeName:"Slovenčina"},
  {code:"lt",name:"Lithuanian",   nativeName:"Lietuvių"},
  {code:"lv",name:"Latvian",      nativeName:"Latviešu"},
  {code:"et",name:"Estonian",     nativeName:"Eesti"},
  {code:"sl",name:"Slovenian",    nativeName:"Slovenščina"},
  {code:"ca",name:"Catalan",      nativeName:"Català"},
  {code:"ms",name:"Malay",        nativeName:"Bahasa Melayu"},
  {code:"ta",name:"Tamil",        nativeName:"தமிழ்"},
  {code:"te",name:"Telugu",       nativeName:"తెలుగు"},
  {code:"bn",name:"Bengali",      nativeName:"বাংলা"},
  {code:"ur",name:"Urdu",         nativeName:"اردو"},
  {code:"sw",name:"Swahili",      nativeName:"Kiswahili"},
  {code:"el",name:"Greek",        nativeName:"Ελληνικά"},
];
const WHISPER_LANGS:Language[] = [{code:"auto",name:"Auto-detect",nativeName:""}, ...LANGUAGES];

// ─── LangSelector ─────────────────────────────────────────────────────────────
function LangSelector({label,value,onChange,options=LANGUAGES}:{label?:string;value:string;onChange:(v:string)=>void;options?:Language[]}) {
  const id=useId();
  return (
    <div>
      {label&&<div id={id} style={{fontSize:9,fontWeight:700,letterSpacing:"0.12em",textTransform:"uppercase" as const,color:C.t3,marginBottom:6}}>{label}</div>}
      <div style={{position:"relative"}}>
        <select aria-labelledby={id} value={value} onChange={e=>onChange(e.target.value)}
          style={{appearance:"none",background:C.bgInput,border:`1px solid ${C.bdC}`,borderRadius:7,color:C.t1,fontSize:12,fontFamily:"inherit",padding:"9px 30px 9px 11px",width:"100%",cursor:"pointer",outline:"none",boxShadow:"inset 0 1px 3px rgba(0,0,0,0.2)"}}>
          {options.map(l=>(
            <option key={l.code} value={l.code} style={{background:C.bgRaised}}>
              {l.name}{l.nativeName&&l.nativeName!==l.name?` — ${l.nativeName}`:""}
            </option>
          ))}
        </select>
        <ChevronDown size={11} style={{position:"absolute",right:9,top:"50%",transform:"translateY(-50%)",pointerEvents:"none",color:C.t3}}/>
      </div>
    </div>
  );
}

// ─── QualityPicker ────────────────────────────────────────────────────────────
const QUALITY_OPTS=[
  {v:"fast",    l:"Fast",    sub:"Whisper tiny · pyttsx3 TTS",         color:C.cyL},
  {v:"balanced",l:"Balanced",sub:"Whisper base · XTTS v2 cloning",     color:C.cy},
  {v:"studio",  l:"Studio",  sub:"Whisper large-v3 · XTTS v2 + NLLB-200",color:C.gd},
];
function QualityPicker({value,onChange}:{value:string;onChange:(v:string)=>void}) {
  return (
    <div>
      <SL>Quality</SL>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6}}>
        {QUALITY_OPTS.map(q=>(
          <div key={q.v} onClick={()=>onChange(q.v)} role="radio" aria-checked={value===q.v} tabIndex={0}
            onKeyDown={e=>{if(e.key===" "||e.key==="Enter"){e.preventDefault();onChange(q.v);}}}
            style={{
              padding:"9px 10px",borderRadius:8,cursor:"pointer",userSelect:"none" as const,
              background:value===q.v?`${q.color}12`:C.bgCard,
              border:`1px solid ${value===q.v?q.color+"40":C.bd}`,
              transition:`background 150ms ${ease.out}, border-color 150ms ${ease.out}`,
            }}>
            <div style={{fontSize:11,fontWeight:700,color:value===q.v?q.color:C.t1,marginBottom:3}}>{q.l}</div>
            <div style={{fontSize:9,color:C.t3,lineHeight:1.4}}>{q.sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── PipelineSteps ────────────────────────────────────────────────────────────
const DUB_STAGES=[
  {key:"extract",    label:"Extract audio"},
  {key:"separate",   label:"Separate vocals"},
  {key:"transcribe", label:"Transcribe speech"},
  {key:"translate",  label:"Translate text"},
  {key:"synthesize", label:"Clone & synthesize voice"},
  {key:"lipsync",    label:"Lip sync"},
  {key:"render",     label:"Render final video"},
];
function PipelineSteps({logs,status}:{logs:string[];status:string}) {
  // Determine which stages are complete/running based on log content
  const lower = logs.map(l=>l.toLowerCase()).join("\n");
  const stageStatus = DUB_STAGES.map((s,i)=>{
    const next = DUB_STAGES[i+1];
    const thisFound = lower.includes(s.key);
    const nextFound = next ? lower.includes(next.key) : status==="done";
    if (!thisFound) return "pending";
    if (nextFound) return "done";
    return "running";
  });

  return (
    <div style={{display:"flex",flexDirection:"column",gap:4,marginTop:8,padding:"12px 14px",borderRadius:8,background:C.bgDeep,border:`1px solid ${C.bd}`}}>
      <div style={{fontSize:9,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase" as const,color:C.t3,marginBottom:6}}>Pipeline</div>
      {DUB_STAGES.map((s,i)=>{
        const st = stageStatus[i];
        const color = st==="done"?C.ok:st==="running"?C.cy:C.t4;
        const barW = st==="done"?"100%":st==="running"?"50%":"0%";
        return (
          <div key={s.key} style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{
              width:18,height:18,borderRadius:"50%",flexShrink:0,
              display:"flex",alignItems:"center",justifyContent:"center",
              background:st==="done"?C.okA:st==="running"?C.cyA:"rgba(255,255,255,0.03)",
              border:`1px solid ${st==="done"?C.okB:st==="running"?C.cyB:C.bd}`,
              fontSize:8,fontWeight:800,color:st==="done"?C.ok:st==="running"?C.cy:C.t4,
            }}>
              {st==="done"?<Check size={8}/>:st==="running"?<div style={{width:5,height:5,borderRadius:"50%",background:C.cy,animation:"pulse-dot 1s ease-in-out infinite"}}/>:i+1}
            </div>
            <span style={{flex:1,fontSize:10,color:st==="pending"?C.t4:C.t2,fontWeight:st==="running"?600:400}}>{s.label}</span>
            <div style={{width:60,height:2,borderRadius:99,background:C.bd,overflow:"hidden",flexShrink:0}}>
              <div style={{height:"100%",borderRadius:99,width:barW,background:color,transition:`width 500ms ${ease.out}`,animation:st==="running"?"sweep 2s linear infinite":"none",backgroundSize:"200% 100%"}}/>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Tab: Hollywood Dub ───────────────────────────────────────────────────────
function DubTab({files,scanState,onOpen,out,onJob,onGoSettings,toast,deps,dubDeps}:{
  files:MediaFile[];scanState:ScanState;onOpen:()=>void;out:OutputSettings;
  onJob:(j:Job)=>void;onGoSettings:()=>void;toast:(t:Omit<Toast,"id">)=>void;
  deps:DepStatus|null;dubDeps:DubDeps|null;
}) {
  const [srcLang, setSrcLang] = useState("auto");
  const [tgtLang, setTgtLang] = useState("en");
  const [whisperModel, setWhisperModel] = useState("base");
  const [preserveBg, setPreserveBg] = useState(true);
  const [lipSync,     setLipSync]    = useState(true);
  const [quality,     setQuality]    = useState("balanced");
  const [lf,  setLf]  = useState<MediaFile[]>([]);
  useEffect(()=>{setLf(files.map(f=>({...f,selected:false})));}, [files]);
  const toggle=(p:string)=>setLf(f=>f.map(x=>x.path===p?{...x,selected:!x.selected}:x));
  const selAll=(v:boolean)=>setLf(f=>f.map(x=>({...x,selected:v})));
  const sel=lf.filter(f=>f.selected);
  const tgtLangObj = LANGUAGES.find(l=>l.code===tgtLang) || LANGUAGES[0];

  const hasCriticalDeps = dubDeps?.whisper;
  const missingCore = !deps?.ffmpeg||!hasCriticalDeps;

  const run=()=>{
    if(!sel.length) return;
    const id=Date.now().toString();
    onJob({id,name:`Dub → ${tgtLangObj.name} ×${sel.length}`,type:"dub",status:"running",progress:0,log:[],startTime:Date.now()});
    toast({kind:"info",title:"Hollywood Dub started",body:`${sel.length} file${sel.length>1?"s":""} → ${tgtLangObj.name}`});
    if(isEl()) window.electronAPI!.dubFiles(sel.map(f=>f.path),srcLang,tgtLang,whisperModel,preserveBg,lipSync,quality,out,id);
  };

  return (
    <div style={{display:"flex",flexDirection:"column",gap:18,animation:"enter 220ms cubic-bezier(0.23,1,0.32,1) both"}}>
      {deps&&!deps.ffmpeg&&<DepWarn missing="ffmpeg" onGoSettings={onGoSettings}/>}
      {dubDeps&&!dubDeps.whisper&&<DepWarn missing="openai-whisper (required for dubbing)" onGoSettings={onGoSettings}/>}

      {/* Pipeline hero */}
      <div style={{display:"flex",alignItems:"center",gap:0,padding:"12px 16px",borderRadius:10,background:C.gdA,border:`1px solid ${C.gdB}`}}>
        {[
          {Icon:Volume2,   label:"Separate"},
          {Icon:Languages, label:"Transcribe"},
          {Icon:Languages, label:"Translate"},
          {Icon:Mic2,      label:"Clone Voice"},
          {Icon:Clapperboard,label:"Lip Sync"},
          {Icon:Film,      label:"Render"},
        ].map(({Icon,label},i)=>(
          <div key={label+i} style={{display:"flex",alignItems:"center",flex:1}}>
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4,flex:1}}>
              <div style={{width:28,height:28,borderRadius:8,background:C.gdA,border:`1px solid ${C.gdB}`,display:"flex",alignItems:"center",justifyContent:"center"}}>
                <Icon size={12} style={{color:C.gd}}/>
              </div>
              <span style={{fontSize:8,color:C.t3,fontWeight:600,letterSpacing:"0.06em",textTransform:"uppercase" as const}}>{label}</span>
            </div>
            {i<5&&<div style={{width:16,height:1,background:`linear-gradient(90deg,${C.gdB},transparent)`,flexShrink:0}}/>}
          </div>
        ))}
      </div>

      {/* Languages */}
      <div style={{display:"grid",gridTemplateColumns:"1fr auto 1fr",gap:8,alignItems:"end"}}>
        <LangSelector label="Source Language" value={srcLang} onChange={setSrcLang} options={WHISPER_LANGS}/>
        <div style={{width:24,height:24,borderRadius:"50%",background:C.gdA,border:`1px solid ${C.gdB}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginBottom:1}}>
          <ArrowRight size={11} style={{color:C.gd}}/>
        </div>
        <LangSelector label="Target Language" value={tgtLang} onChange={setTgtLang} options={LANGUAGES}/>
      </div>

      <QualityPicker value={quality} onChange={setQuality}/>

      {/* Toggles */}
      <div style={{borderTop:`1px solid ${C.bd}`,borderBottom:`1px solid ${C.bd}`}}>
        {[
          {on:preserveBg, set:setPreserveBg, label:"Preserve background audio",    desc:"Demucs separates vocals from music — original score is kept",     color:C.cy},
          {on:lipSync,    set:setLipSync,    label:"Neural lip sync",              desc:"Wav2Lip matches mouth movements to the dubbed voice track",         color:C.cyL},
        ].map(({on,set,label,desc,color},i)=>(
          <label key={label} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 0",cursor:"pointer",borderTop:i>0?`1px solid ${C.bd}`:"none"}}>
            <Toggle on={on} onChange={set}/>
            <div style={{flex:1}}>
              <div style={{fontSize:12,fontWeight:500,color:on?C.t1:C.t2}}>{label}</div>
              <div style={{fontSize:10,color:C.t3,marginTop:1}}>{desc}</div>
            </div>
            {on&&<div style={{fontSize:9,fontWeight:700,padding:"2px 6px",borderRadius:4,background:`${color}15`,color,border:`1px solid ${color}30`,letterSpacing:"0.06em"}}>ON</div>}
          </label>
        ))}
      </div>

      {/* Dep status mini chips */}
      {dubDeps&&(
        <div style={{display:"flex",flexWrap:"wrap" as const,gap:5}}>
          {([
            {k:"demucs"      as const,l:"Demucs"},
            {k:"tts"         as const,l:"XTTS v2"},
            {k:"transformers"as const,l:"NLLB-200"},
            {k:"soundfile"   as const,l:"soundfile"},
          ] as {k:keyof DubDeps,l:string}[]).map(({k,l})=>(
            <div key={k} style={{display:"flex",alignItems:"center",gap:4,padding:"2px 7px",borderRadius:99,background:dubDeps[k]?C.okA:C.erA,border:`1px solid ${dubDeps[k]?C.okB:C.erB}`,fontSize:9}}>
              <div style={{width:4,height:4,borderRadius:"50%",background:dubDeps[k]?C.ok:C.er}}/>
              <span style={{color:dubDeps[k]?C.ok:C.er,fontWeight:600}}>{l}</span>
            </div>
          ))}
        </div>
      )}

      <OutStrip s={out} onGo={onGoSettings}/>
      <div>
        <SL>Select Files to Dub</SL>
        <FileList files={lf} scanState={scanState} onToggle={toggle} onSelectAll={selAll} onOpen={onOpen}/>
      </div>

      <div>
        <button
          onClick={sel.length&&!missingCore?run:undefined}
          disabled={!sel.length||!!missingCore}
          style={{
            display:"flex",alignItems:"center",justifyContent:"center",gap:8,
            width:"100%",padding:"12px",borderRadius:9,
            background: sel.length&&!missingCore
              ? "linear-gradient(135deg,#B07800,#E8A800)"
              : "rgba(232,168,0,0.08)",
            border:`1px solid ${sel.length&&!missingCore?"rgba(232,168,0,0.5)":C.gdB}`,
            color: sel.length&&!missingCore?"#1A0F00":C.t3,
            fontWeight:700,fontSize:12,letterSpacing:"0.05em",textTransform:"uppercase" as const,
            cursor:sel.length&&!missingCore?"pointer":"not-allowed",
            opacity:missingCore?0.5:1,
            boxShadow:sel.length&&!missingCore?"inset 0 1px 0 rgba(255,200,0,0.2), 0 2px 8px rgba(0,0,0,0.3)":"none",
            transition:`background 150ms ${ease.out}`,
            userSelect:"none" as const,
          }}>
          <Mic2 size={14}/>
          {sel.length>0?`Dub ${sel.length} File${sel.length>1?"s":""} to ${tgtLangObj.name}`:"Select Files to Dub"}
        </button>
        {!sel.length&&scanState==="done"&&files.length>0&&(
          <div style={{marginTop:6,fontSize:10,color:C.t3,textAlign:"center" as const}}>Check files above to start dubbing</div>
        )}
      </div>
    </div>
  );
}

// ─── Tab: Smooth Frames (Interpolation) ───────────────────────────────────────
const MULT_OPTS=[
  {v:2, label:"2×",  sub:"2× frame rate",    eg:"24fps → 48fps",  color:"#8B5CF6"},
  {v:4, label:"4×",  sub:"4× frame rate",    eg:"24fps → 96fps",  color:"#A78BFA"},
  {v:8, label:"8×",  sub:"8× frame rate",    eg:"24fps → 192fps", color:"#C4B5FD"},
];
function InterpolateTab({files,scanState,onOpen,out,onJob,onGoSettings,toast,deps}:{
  files:MediaFile[];scanState:ScanState;onOpen:()=>void;out:OutputSettings;
  onJob:(j:Job)=>void;onGoSettings:()=>void;toast:(t:Omit<Toast,"id">)=>void;deps:DepStatus|null;
}) {
  const [multiplier, setMultiplier] = useState(2);
  const [method,     setMethod]     = useState("rife");
  const [lf, setLf]  = useState<MediaFile[]>([]);
  useEffect(()=>{setLf(files.map(f=>({...f,selected:false})));}, [files]);
  const toggle=(p:string)=>setLf(f=>f.map(x=>x.path===p?{...x,selected:!x.selected}:x));
  const selAll=(v:boolean)=>setLf(f=>f.map(x=>({...x,selected:v})));
  const sel=lf.filter(f=>f.selected);

  const run=()=>{
    if(!sel.length) return;
    const id=Date.now().toString();
    onJob({id,name:`${multiplier}× Smooth Frames ×${sel.length}`,type:"interpolate",status:"running",progress:0,log:[],startTime:Date.now()});
    toast({kind:"info",title:`${multiplier}× Frame Interpolation`,body:`${sel.length} file${sel.length>1?"s":""}`});
    if(isEl()) window.electronAPI!.interpolateFiles(sel.map(f=>f.path),multiplier,method,out,id);
  };

  return (
    <div style={{display:"flex",flexDirection:"column",gap:20,animation:"enter 220ms cubic-bezier(0.23,1,0.32,1) both"}}>
      {deps&&!deps.ffmpeg&&<DepWarn missing="ffmpeg" onGoSettings={onGoSettings}/>}

      <div>
        <SL>Frame Rate Multiplier</SL>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
          {MULT_OPTS.map(o=>(
            <div key={o.v} onClick={()=>setMultiplier(o.v)} role="radio" aria-checked={multiplier===o.v} tabIndex={0}
              onKeyDown={e=>{if(e.key===" "||e.key==="Enter"){e.preventDefault();setMultiplier(o.v);}}}
              style={{
                padding:"14px 12px",borderRadius:10,cursor:"pointer",userSelect:"none" as const,
                background:multiplier===o.v?`${o.color}12`:C.bgCard,
                border:`1px solid ${multiplier===o.v?o.color+"50":C.bd}`,
                boxShadow:multiplier===o.v?"inset 0 1px 0 rgba(255,255,255,0.05)":"none",
                transition:`background 150ms ${ease.out}, border-color 150ms ${ease.out}`,
                textAlign:"center" as const,
              }}>
              <div style={{fontSize:22,fontWeight:800,color:multiplier===o.v?o.color:C.t2,letterSpacing:"-0.04em",marginBottom:4}}>{o.label}</div>
              <div style={{fontSize:10,color:multiplier===o.v?o.color:C.t3,fontWeight:600,marginBottom:2}}>{o.sub}</div>
              <div style={{fontSize:9,color:C.t3}}>{o.eg}</div>
              {multiplier===o.v&&<div style={{marginTop:8,height:1.5,background:`linear-gradient(90deg,${o.color},transparent)`,borderRadius:99}}/>}
            </div>
          ))}
        </div>
      </div>

      {/* Method */}
      <div style={{borderTop:`1px solid ${C.bd}`,borderBottom:`1px solid ${C.bd}`}}>
        {[
          {v:"rife",         label:"RIFE — Neural interpolation",       desc:"AI-based, highest quality, requires RIFE installation"},
          {v:"minterpolate", label:"FFmpeg minterpolate — Fast fallback", desc:"No extra deps, slightly lower quality"},
        ].map(({v,label,desc},i)=>(
          <div key={v} onClick={()=>setMethod(v)}
            style={{display:"flex",alignItems:"center",gap:12,padding:"11px 0",cursor:"pointer",borderTop:i>0?`1px solid ${C.bd}`:"none"}}>
            <div style={{width:14,height:14,borderRadius:"50%",flexShrink:0,background:method===v?"#8B5CF6":"transparent",border:`1.5px solid ${method===v?"#8B5CF6":C.t3}`,transition:`all 150ms ${ease.out}`}}/>
            <div style={{flex:1}}>
              <div style={{fontSize:12,fontWeight:method===v?600:400,color:method===v?C.t1:C.t2}}>{label}</div>
              <div style={{fontSize:10,color:C.t3,marginTop:1}}>{desc}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{padding:"8px 12px",borderRadius:7,background:C.cyA,border:`1px solid ${C.bdC}`,fontSize:10,color:C.t3,lineHeight:1.6}}>
        <span style={{color:C.cy,fontWeight:600}}>Note:</span> RIFE auto-installs from <code style={{fontFamily:"monospace",color:C.t2}}>github.com/hzwer/ECCV2022-RIFE</code>. If not present, the app falls back to FFmpeg minterpolate automatically.
      </div>

      <OutStrip s={out} onGo={onGoSettings}/>
      <div>
        <SL>Select Files</SL>
        <FileList files={lf} scanState={scanState} onToggle={toggle} onSelectAll={selAll} onOpen={onOpen}/>
      </div>

      <button
        onClick={sel.length?run:undefined}
        disabled={!sel.length}
        style={{
          display:"flex",alignItems:"center",justifyContent:"center",gap:8,
          width:"100%",padding:"12px",borderRadius:9,
          background:sel.length?"linear-gradient(135deg,#5B21B6,#8B5CF6)":"rgba(139,92,246,0.08)",
          border:`1px solid ${sel.length?"rgba(139,92,246,0.5)":"rgba(139,92,246,0.2)"}`,
          color:sel.length?"#F5F0FF":C.t3,
          fontWeight:700,fontSize:12,letterSpacing:"0.05em",textTransform:"uppercase" as const,
          cursor:sel.length?"pointer":"not-allowed",
          boxShadow:sel.length?"inset 0 1px 0 rgba(255,255,255,0.1), 0 2px 8px rgba(0,0,0,0.3)":"none",
          transition:`background 150ms ${ease.out}`,
          userSelect:"none" as const,
        }}>
        <TrendingUp size={14}/>
        {sel.length>0?`Interpolate ${sel.length} File${sel.length>1?"s":""} to ${multiplier}×`:"Select Files"}
      </button>
    </div>
  );
}

// ─── Tab: Subtitles ───────────────────────────────────────────────────────────
const LANGS=LANGUAGES.map(l=>({value:l.code,label:l.name}));

function SubtitlesTab({files,scanState,onOpen,out,onJob,onGoSettings,toast,deps}:{
  files:MediaFile[];scanState:ScanState;onOpen:()=>void;out:OutputSettings;
  onJob:(j:Job)=>void;onGoSettings:()=>void;toast:(t:Omit<Toast,"id">)=>void;deps:DepStatus|null;
}) {
  const [model,   setModel]    = useState("base");
  const [srcLang, setSrcLang]  = useState("auto");
  const [tgtLang, setTgtLang]  = useState("en");
  const [translate,setTranslate]=useState(false);
  const [burnIn,  setBurnIn]   = useState(false);
  const [lf,      setLf]       = useState<MediaFile[]>([]);
  useEffect(()=>{setLf(files.map(f=>({...f,selected:!f.hasSrt})));}, [files]);
  const toggle=(p:string)=>setLf(f=>f.map(x=>x.path===p?{...x,selected:!x.selected}:x));
  const selAll=(v:boolean)=>setLf(f=>f.map(x=>({...x,selected:v})));
  const sel=lf.filter(f=>f.selected);

  const run=()=>{
    if(!sel.length) return;
    const id=Date.now().toString();
    onJob({id,name:`Subtitles · ${model} · ×${sel.length}`,type:"subtitles",status:"running",progress:0,log:[],startTime:Date.now()});
    toast({kind:"info",title:"Transcribing",body:`Whisper ${model} · ${sel.length} file${sel.length>1?"s":""}`});
    if(isEl()) window.electronAPI!.generateSubs(sel.map(f=>f.path),model,srcLang,tgtLang,translate,burnIn,out,id);
  };

  const needsDeps = deps && (!deps.whisper || (burnIn && !deps.ffmpeg));

  return (
    <div style={{display:"flex",flexDirection:"column",gap:20,animation:"enter 220ms cubic-bezier(0.23,1,0.32,1) both"}}>
      {deps&&!deps.whisper&&<DepWarn missing="openai-whisper" onGoSettings={onGoSettings}/>}
      {deps&&burnIn&&!deps.ffmpeg&&<DepWarn missing="ffmpeg (for burn-in)" onGoSettings={onGoSettings}/>}

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <Sel label="Whisper Model" value={model} onChange={setModel} options={[
          {value:"tiny",    label:"Tiny — Fastest"},
          {value:"base",    label:"Base — Balanced"},
          {value:"small",   label:"Small — Better"},
          {value:"medium",  label:"Medium — High accuracy"},
          {value:"large-v3",label:"Large-v3 — Best (slow)"},
        ]}/>
        <LangSelector label="Source Language" value={srcLang} onChange={setSrcLang} options={WHISPER_LANGS}/>
      </div>

      <div style={{display:"flex",flexDirection:"column",gap:0,borderTop:`1px solid ${C.bd}`,borderBottom:`1px solid ${C.bd}`}}>
        <label style={{display:"flex",alignItems:"center",gap:12,padding:"12px 0",cursor:"pointer"}}>
          <Toggle on={translate} onChange={setTranslate}/>
          <div style={{flex:1}}>
            <div style={{fontSize:12,fontWeight:500,color:translate?C.t1:C.t2}}>Translate subtitles</div>
            <div style={{fontSize:10,color:C.t3,marginTop:1}}>Translates speech to the chosen target language</div>
          </div>
        </label>
        {translate&&(
          <div style={{paddingBottom:12,paddingLeft:48}}>
            <LangSelector label="Translate to" value={tgtLang} onChange={setTgtLang} options={LANGUAGES}/>
          </div>
        )}
        <label style={{display:"flex",alignItems:"center",gap:12,padding:"12px 0",cursor:"pointer",borderTop:`1px solid ${C.bd}`}}>
          <Toggle on={burnIn} onChange={setBurnIn}/>
          <div style={{flex:1}}>
            <div style={{fontSize:12,fontWeight:500,color:burnIn?C.t1:C.t2}}>Burn subtitles into video</div>
            <div style={{fontSize:10,color:C.t3,marginTop:1}}>Permanently embed · plays on all devices</div>
          </div>
        </label>
      </div>

      <OutStrip s={out} onGo={onGoSettings}/>
      <div>
        <SL>Select Files <span style={{textTransform:"none" as const,fontWeight:400,color:C.t4}}>(files without SRT pre-selected)</span></SL>
        <FileList files={lf} scanState={scanState} onToggle={toggle} onSelectAll={selAll} onOpen={onOpen} showSrt/>
      </div>

      <div>
        <PBtn onClick={run} disabled={!sel.length||!!needsDeps} style={{width:"100%",padding:"11px",fontSize:12,borderRadius:9}}>
          <Captions size={13}/>
          {sel.length>0?`Generate Subtitles ×${sel.length}`:"Select Files"}
        </PBtn>
        {!sel.length&&scanState==="done"&&files.length>0&&(
          <div style={{marginTop:6,fontSize:10,color:C.t3,textAlign:"center" as const}}>Check files above to generate subtitles</div>
        )}
      </div>
    </div>
  );
}

// ─── Tab: AI Remaster ─────────────────────────────────────────────────────────
const MODELS = [
  {v:"general",l:"General HD",   desc:"Films, TV, live footage",       color:C.cy,  bg:C.cyA,  border:C.cyB},
  {v:"anime",  l:"Anime / CGI",  desc:"Anime, cartoons, 3D renders",   color:C.cyL, bg:`rgba(51,214,245,0.07)`,border:`rgba(51,214,245,0.18)`},
  {v:"face",   l:"Faces",        desc:"Portraits, character detail",   color:C.wa,  bg:C.gdA,  border:C.gdB},
  {v:"film",   l:"Film Restore", desc:"1970s–90s grain, scratch, color",color:C.gd,  bg:C.gdA,  border:`rgba(232,168,0,0.25)`},
];

function RemasterTab({files,scanState,onOpen,out,onJob,onGoSettings,toast,deps}:{
  files:MediaFile[];scanState:ScanState;onOpen:()=>void;out:OutputSettings;
  onJob:(j:Job)=>void;onGoSettings:()=>void;toast:(t:Omit<Toast,"id">)=>void;deps:DepStatus|null;
}) {
  const [model,setModel]=useState("general");
  const [res,setRes]=useState<"fhd"|"4k"|"8k">("4k");
  const [denoise,setDenoise]=useState(2);
  const [colorR,setColorR]=useState(true);
  const [scratch,setScratch]=useState(true);
  const [hdr,setHdr]=useState(false);
  const [lf,setLf]=useState<MediaFile[]>([]);
  useEffect(()=>{setLf(files.map(f=>({...f,selected:false})));}, [files]);
  const toggle=(p:string)=>setLf(f=>f.map(x=>x.path===p?{...x,selected:!x.selected}:x));
  const selAll=(v:boolean)=>setLf(f=>f.map(x=>({...x,selected:v})));
  const sel=lf.filter(f=>f.selected);
  const am=MODELS.find(m=>m.v===model)!;

  const run=()=>{
    if(!sel.length) return;
    const id=Date.now().toString();
    onJob({id,name:`Remaster → ${res.toUpperCase()} · ${model}`,type:"remaster",status:"running",progress:0,log:[],startTime:Date.now()});
    toast({kind:"info",title:`Remastering to ${res.toUpperCase()}`,body:`${model} model · ${sel.length} file${sel.length>1?"s":""}`});
    if(isEl()) window.electronAPI!.remasterFiles(
      sel.map(f=>f.path),
      {model:model as RemasterOpts["model"],targetRes:res,denoiseLevel:denoise,colorRestore:colorR,scratchRemoval:scratch,hdr},
      out, id
    );
  };

  const canRun = sel.length > 0 && deps?.ffmpeg !== false;

  return (
    <div style={{display:"flex",flexDirection:"column",gap:20,animation:"enter 220ms cubic-bezier(0.23,1,0.32,1) both"}}>
      {deps&&!deps.ffmpeg&&<DepWarn missing="ffmpeg" onGoSettings={onGoSettings}/>}

      <div>
        <SL>AI Enhancement Model</SL>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7}}>
          {MODELS.map(m=>(
            <div key={m.v}
              role="radio" aria-checked={model===m.v} tabIndex={0}
              onClick={()=>setModel(m.v)}
              onKeyDown={e=>{if(e.key===" "||e.key==="Enter"){e.preventDefault();setModel(m.v);}}}
              style={{
                padding:"11px 13px",borderRadius:8,
                cursor:"pointer",
                background: model===m.v?m.bg:C.bgCard,
                border:`1px solid ${model===m.v?m.border:C.bd}`,
                boxShadow: model===m.v?"inset 0 1px 0 rgba(255,255,255,0.05)":"none",
                transition:`background 150ms ${ease.out}, border-color 150ms ${ease.out}`,
                userSelect:"none" as const,
              }}>
              <div style={{fontSize:12,fontWeight:600,color:model===m.v?m.color:C.t1,marginBottom:3,letterSpacing:"-0.01em"}}>{m.l}</div>
              <div style={{fontSize:10,color:C.t3,lineHeight:1.4}}>{m.desc}</div>
              {model===m.v&&<div style={{marginTop:7,height:1.5,background:`linear-gradient(90deg,${m.color},transparent)`,borderRadius:99}}/>}
            </div>
          ))}
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <Sel label="Target Resolution" value={res} onChange={v=>setRes(v as "fhd"|"4k"|"8k")} options={[{value:"fhd",label:"FHD — 1920×1080"},{value:"4k",label:"4K — 3840×2160"},{value:"8k",label:"8K — 7680×4320"}]}/>
        <Sel label="Denoise Level" value={String(denoise)} onChange={v=>setDenoise(Number(v))} options={[{value:"0",label:"None — preserve grain"},{value:"1",label:"Light"},{value:"2",label:"Medium"},{value:"3",label:"Heavy"}]}/>
      </div>

      <div style={{borderTop:`1px solid ${C.bd}`,borderBottom:`1px solid ${C.bd}`}}>
        {[
          {on:colorR,  set:setColorR,  label:"Color restoration",          desc:"Recover faded colors and yellowing"},
          {on:scratch, set:setScratch, label:"Scratch & artifact removal",  desc:"Film grain, scratches, compression noise"},
          {on:hdr,     set:setHdr,     label:"HDR conversion",              desc:"bt.2020 + ST.2084 PQ tone mapping"},
        ].map(({on,set,label,desc},i)=>(
          <label key={label} style={{display:"flex",alignItems:"center",gap:12,padding:"11px 0",cursor:"pointer",borderTop:i>0?`1px solid ${C.bd}`:"none"}}>
            <Toggle on={on} onChange={set}/>
            <div style={{flex:1}}>
              <div style={{fontSize:12,fontWeight:500,color:on?C.t1:C.t2}}>{label}</div>
              <div style={{fontSize:10,color:C.t3,marginTop:1}}>{desc}</div>
            </div>
          </label>
        ))}
      </div>

      <OutStrip s={out} onGo={onGoSettings}/>
      <div>
        <SL>Select Files to Remaster</SL>
        <FileList files={lf} scanState={scanState} onToggle={toggle} onSelectAll={selAll} onOpen={onOpen}/>
      </div>

      <div>
        <PBtn onClick={run} disabled={!canRun} style={{
          width:"100%",padding:"11px",fontSize:12,borderRadius:9,
          background: canRun
            ? am.v==="general"||am.v==="anime"
              ? "linear-gradient(135deg,#009AB5,#00C9F0)"
              : "linear-gradient(135deg,#B07800,#E8A800)"
            : "rgba(232,168,0,0.1)",
          border:`1px solid ${canRun?am.border:C.gdB}`,
          color: canRun
            ? am.v==="general"||am.v==="anime" ? "#000B10" : "#1A0F00"
            : C.t3,
          boxShadow: canRun?"inset 0 1px 0 rgba(255,255,255,0.15), 0 1px 3px rgba(0,0,0,0.3)":"none",
        }}>
          <Sparkles size={13}/>
          {sel.length>0?`Remaster to ${res.toUpperCase()} ×${sel.length}`:`Select Files to Remaster`}
        </PBtn>
        {!sel.length&&scanState==="done"&&files.length>0&&(
          <div style={{marginTop:6,fontSize:10,color:C.t3,textAlign:"center" as const}}>Check files above to remaster them</div>
        )}
      </div>
    </div>
  );
}

// ─── Tab: Automate ────────────────────────────────────────────────────────────
function AutomateTab({files,folder,scanState,onOpen,out,onJob,onGoSettings,toast,deps}:{
  files:MediaFile[];folder:string;scanState:ScanState;onOpen:()=>void;out:OutputSettings;
  onJob:(j:Job)=>void;onGoSettings:()=>void;toast:(t:Omit<Toast,"id">)=>void;deps:DepStatus|null;
}) {
  const [rules,setRules]=useState<AutomationRules>({autoConvert:true,autoSubs:true,autoTranslate:false,autoDub:false});
  const [dubLang,setDubLang]=useState("en");
  const setR=(k:keyof AutomationRules)=>(v:boolean)=>setRules(r=>({...r,[k]:v}));
  const active=Object.values(rules).filter(Boolean).length;

  const RDEFS=[
    {k:"autoConvert"    as const,Icon:Film,      color:C.cy,  label:"Auto-convert non-MP4 → MP4", count:files.filter(f=>NON_MP4.has(f.ext)).length},
    {k:"autoSubs"       as const,Icon:Captions,  color:C.cyL, label:"Auto-generate subtitles",      count:files.filter(f=>!f.hasSrt).length},
    {k:"autoTranslate"  as const,Icon:ArrowRight, color:C.ok,  label:"Translate subtitles to English",count:null},
    {k:"autoDub"        as const,Icon:Mic2,       color:C.gd,  label:"Auto-dub to target language",   count:null},
  ];

  const disabledReason = !active?"Enable at least one rule":!folder?"Open a folder first":scanState!=="done"?"Wait for scan to complete":null;

  const run=()=>{
    if(disabledReason) return;
    const id=Date.now().toString();
    onJob({id,name:`Automation · ${active} rule${active!==1?"s":""}`,type:"automate",status:"running",progress:0,log:[],startTime:Date.now()});
    toast({kind:"info",title:"Running automation",body:`${active} rules on ${files.length} files`});
    if(isEl()) window.electronAPI!.runAutomation(rules,folder,out,id);
  };

  return (
    <div style={{display:"flex",flexDirection:"column",gap:18,animation:"enter 220ms cubic-bezier(0.23,1,0.32,1) both"}}>
      {deps&&rules.autoSubs&&!deps.whisper&&<DepWarn missing="openai-whisper (for subtitles)" onGoSettings={onGoSettings}/>}
      {deps&&rules.autoConvert&&!deps.ffmpeg&&<DepWarn missing="ffmpeg (for conversion)" onGoSettings={onGoSettings}/>}

      <div style={{borderTop:`1px solid ${C.bd}`}}>
        {RDEFS.map(({k,Icon,color,label,count})=>{
          const on=rules[k];
          return (
            <div key={k} style={{borderBottom:`1px solid ${C.bd}`}}>
              <label style={{display:"flex",alignItems:"center",gap:12,padding:"13px 0",cursor:"pointer"}}>
                <div style={{width:36,height:36,borderRadius:9,background:on?`${color}15`:"rgba(255,255,255,0.03)",border:`1px solid ${on?`${color}30`:C.bd}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,transition:T.col}}>
                  <Icon size={14} style={{color:on?color:C.t3}}/>
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:12,fontWeight:500,color:on?C.t1:C.t2}}>{label}</div>
                  {count!==null&&<div style={{fontSize:10,color:C.t3,marginTop:1,fontVariantNumeric:"tabular-nums"}}>{count} files affected</div>}
                </div>
                {count!==null&&count>0&&<span style={{fontSize:11,fontWeight:700,color:on?color:C.t3,minWidth:24,textAlign:"center" as const,fontVariantNumeric:"tabular-nums"}}>{count}</span>}
                <Toggle on={on} onChange={setR(k)}/>
              </label>
              {k==="autoDub"&&on&&(
                <div style={{paddingBottom:12,paddingLeft:48}}>
                  <LangSelector label="Dub to language" value={dubLang} onChange={setDubLang} options={LANGUAGES}/>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <OutStrip s={out} onGo={onGoSettings}/>

      {folder
        ?<div style={{fontSize:11,color:C.t3,fontVariantNumeric:"tabular-nums"}}>
          <span style={{color:C.cy,fontWeight:600}}>{folder.split("/").slice(-2).join("/")}</span>
          <span style={{color:C.t4,margin:"0 6px"}}>·</span>
          {files.length} files scanned
        </div>
        :<GBtn onClick={onOpen} style={{alignSelf:"flex-start"}}><FolderOpen size={12}/>Open a folder first</GBtn>
      }

      <div>
        <PBtn onClick={run} disabled={!!disabledReason} style={{width:"100%",padding:"11px",fontSize:12,borderRadius:9}}>
          <Bot size={13}/>{disabledReason??"Run "+active+" Rule"+(active!==1?"s":"")}
        </PBtn>
        {disabledReason&&(
          <div style={{marginTop:6,fontSize:10,color:C.t3,textAlign:"center" as const}}>{disabledReason}</div>
        )}
      </div>
    </div>
  );
}

// ─── Tab: Jobs ────────────────────────────────────────────────────────────────
const JT:{[k:string]:{Icon:React.ElementType;color:string;bg:string}}={
  convert:     {Icon:Film,        color:C.cy,       bg:C.cyA},
  subtitles:   {Icon:Captions,    color:C.cyL,      bg:`rgba(51,214,245,0.07)`},
  dub:         {Icon:Mic2,        color:C.gd,       bg:C.gdA},
  remaster:    {Icon:Sparkles,    color:C.gd,       bg:C.gdA},
  interpolate: {Icon:TrendingUp,  color:"#8B5CF6",  bg:"rgba(139,92,246,0.07)"},
  automate:    {Icon:Bot,         color:C.ok,       bg:C.okA},
};

function JobsTab({jobs,onCancel,toast}:{jobs:Job[];onCancel:(id:string)=>void;toast:(t:Omit<Toast,"id">)=>void;}) {
  const [expanded,setExpanded]=useState<string|null>(null);
  const prev=useRef<Job[]>([]);
  useEffect(()=>{
    jobs.forEach(j=>{ const w=prev.current.find(x=>x.id===j.id); if(!w) return;
      if(w.status==="running"&&j.status==="done") toast({kind:"success",title:"Done",body:j.name});
      if(w.status==="running"&&j.status==="error") toast({kind:"error",title:"Failed",body:j.error??j.name});
    });
    prev.current=jobs;
  },[jobs,toast]);

  if(!jobs.length) return (
    <div style={{display:"flex",flexDirection:"column",gap:14,padding:"32px 0",animation:"enter 220ms cubic-bezier(0.23,1,0.32,1) both"}}>
      <div style={{width:44,height:44,borderRadius:11,background:C.cyA,border:`1px solid ${C.cyB}`,boxShadow:"inset 0 1px 0 rgba(0,201,240,0.08)",display:"flex",alignItems:"center",justifyContent:"center"}}>
        <Activity size={20} style={{color:C.cy}}/>
      </div>
      <div>
        <div style={{fontSize:14,fontWeight:600,color:C.t1,marginBottom:4,letterSpacing:"-0.02em"}}>No jobs yet</div>
        <div style={{fontSize:12,color:C.t2,lineHeight:1.5}}>Convert, generate subtitles, or remaster files to see progress here.</div>
      </div>
    </div>
  );

  return (
    <div style={{display:"flex",flexDirection:"column",gap:8,animation:"enter 220ms cubic-bezier(0.23,1,0.32,1) both"}}>
      {jobs.map(job=>{
        const m=JT[job.type]; const Icon=m.Icon; const isE=expanded===job.id;
        const pColor = job.status==="running"?`linear-gradient(90deg,${C.cyD},${C.cy},${C.cyL})`:job.status==="done"?C.ok:job.status==="error"?C.er:C.t3;

        return (
          <div key={job.id} style={{background:"rgba(12,14,20,0.8)",backdropFilter:"blur(16px)",WebkitBackdropFilter:"blur(16px)",borderRadius:12,border:`1px solid ${job.status==="error"?"rgba(255,64,64,0.18)":C.bd}`,overflow:"hidden",boxShadow:"0 2px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)"}}>
            <div style={{padding:"13px 14px",display:"flex",alignItems:"flex-start",gap:12}}>
              <div style={{width:38,height:38,borderRadius:9,background:m.bg,border:`1px solid ${m.color}30`,boxShadow:"inset 0 1px 0 rgba(255,255,255,0.04)",display:"flex",alignItems:"center",justifyContent:"center",position:"relative",flexShrink:0}}>
                <Icon size={15} style={{color:m.color}}/>
                {job.status==="running"&&<div style={{position:"absolute",top:1,right:1,width:7,height:7,borderRadius:"50%",background:C.wa,animation:"pulse-dot 1.2s ease-in-out infinite"}}/>}
              </div>

              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:7}}>
                  <div style={{fontSize:12,fontWeight:600,color:C.t1,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",letterSpacing:"-0.01em"}}>{job.name}</div>
                  <span style={{fontSize:9,fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase" as const,
                    color:job.status==="running"?C.wa:job.status==="done"?C.ok:job.status==="error"?C.er:C.t3,
                    flexShrink:0,
                  }}>{job.status}</span>
                </div>

                <div style={{width:"100%",height:2,background:C.bd,borderRadius:99,overflow:"hidden",marginBottom:7}}>
                  <div style={{
                    height:"100%",borderRadius:99,width:`${job.progress}%`,
                    background:pColor,backgroundSize:"200% 100%",
                    animation:job.status==="running"?"sweep 2.5s linear infinite":"none",
                    transition:`width 300ms ${ease.out}`,
                  }}/>
                </div>

                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <span style={{fontSize:10,color:C.t3,display:"flex",alignItems:"center",gap:4,fontVariantNumeric:"tabular-nums"}}>
                    <Clock size={9}/>{fmtEl(Date.now()-job.startTime)}
                  </span>
                  {job.status==="running"&&<span style={{fontSize:10,color:m.color,fontWeight:700,fontVariantNumeric:"tabular-nums"}}>{job.progress}%</span>}
                </div>

                {job.status==="error"&&job.log.length>0&&(
                  <div style={{marginTop:8,padding:"6px 9px",borderRadius:7,background:C.erA,border:`1px solid ${C.erB}`,display:"flex",gap:6,alignItems:"flex-start"}}>
                    <AlertCircle size={10} style={{color:C.er,flexShrink:0,marginTop:1}}/>
                    <span style={{fontSize:10,color:C.er,lineHeight:1.5}}>{job.log[job.log.length-1]}</span>
                  </div>
                )}
              </div>

              <div style={{display:"flex",flexDirection:"column",gap:4,flexShrink:0}}>
                {job.status==="running"&&(
                  <GBtn onClick={()=>onCancel(job.id)} style={{padding:"4px 9px",fontSize:10,gap:4,color:C.er,borderColor:C.erB}}>
                    <Square size={9}/>Stop
                  </GBtn>
                )}
                {job.log.length>0&&(
                  <GBtn onClick={()=>setExpanded(e=>e===job.id?null:job.id)} style={{padding:"4px 8px"}}>
                    <ChevronDown size={11} style={{transform:isE?"rotate(180deg)":"none",transition:`transform 200ms ${ease.out}`}}/>
                  </GBtn>
                )}
              </div>
            </div>

            {isE&&(
              <div style={{borderTop:`1px solid ${C.bd}`,padding:"8px 14px",animation:"enter 160ms cubic-bezier(0.23,1,0.32,1) both"}}>
                {job.type==="dub"
                  ? <PipelineSteps logs={job.log} status={job.status}/>
                  : (
                    <div style={{maxHeight:120,overflowY:"auto"}}>
                      {job.log.slice(-50).map((l,i)=>(
                        <div key={i} style={{fontSize:10,fontFamily:"monospace",color:C.t3,lineHeight:1.7,wordBreak:"break-all" as const}}>{l}</div>
                      ))}
                    </div>
                  )
                }
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Tab: Settings ────────────────────────────────────────────────────────────
function SettingsTab({output,setOutput,toast,deps,setDeps}:{
  output:OutputSettings;setOutput:(s:OutputSettings)=>void;
  toast:(t:Omit<Toast,"id">)=>void;deps:DepStatus|null;setDeps:(d:DepStatus)=>void;
}) {
  const [installing,setInstalling]=useState(false);

  const recheck=useCallback(async()=>{
    if(isEl()){ const d=await window.electronAPI!.checkDeps(); setDeps(d); }
  },[setDeps]);

  useEffect(()=>{ recheck(); },[]);

  const install=async()=>{
    setInstalling(true); toast({kind:"info",title:"Installing dependencies…"});
    try {
      if(isEl()) await window.electronAPI!.installTools(["ffmpeg","python","whisper","esrgan"]);
      await recheck();
      toast({kind:"success",title:"All tools ready"});
    } catch {
      toast({kind:"error",title:"Install failed",body:"Try manual install below"});
    } finally { setInstalling(false); }
  };

  const allOk=deps&&deps.ffmpeg&&deps.whisper;
  const DEP=[
    {k:"ffmpeg"  as const,l:"ffmpeg",       d:"Video processing engine",   c:C.cy},
    {k:"whisper" as const,l:"openai-whisper",d:"AI subtitle transcription", c:C.cyL},
    {k:"basicsr" as const,l:"basicsr",       d:"AI upscaling core library", c:C.wa},
    {k:"esrgan"  as const,l:"Real-ESRGAN",  d:"AI frame enhancement",      c:C.ok},
  ];

  return (
    <div style={{display:"flex",flexDirection:"column",gap:24,animation:"enter 220ms cubic-bezier(0.23,1,0.32,1) both"}}>
      {/* Output location */}
      <div>
        <SL>Output Location</SL>
        <div style={{display:"flex",flexDirection:"column",gap:0,border:`1px solid ${C.bd}`,borderRadius:9,overflow:"hidden"}}>
          {[
            {v:"alongside",l:"Alongside source file",d:"Saved in the same folder as the input"},
            {v:"custom",   l:"Custom folder",         d:output.customPath||"Click to choose a folder"},
          ].map((o,i)=>(
            <div key={o.v}
              onClick={()=>{
                if(o.v==="custom"&&isEl()) {
                  window.electronAPI!.selectOutputDir().then(p=>{
                    if(p) setOutput({...output,location:"custom",customPath:p});
                  });
                } else {
                  setOutput({...output,location:"alongside"});
                }
              }}
              style={{
                display:"flex",alignItems:"center",gap:12,padding:"12px 14px",cursor:"pointer",
                borderTop:i>0?`1px solid ${C.bd}`:"none",
                background:output.location===o.v?C.cyA:"transparent",
                transition:`background 150ms ${ease.out}`,
              }}>
              <div style={{width:14,height:14,borderRadius:"50%",flexShrink:0,background:output.location===o.v?C.cy:"transparent",border:`1.5px solid ${output.location===o.v?C.cy:C.t3}`,transition:`all 150ms ${ease.out}`}}/>
              <div style={{flex:1}}>
                <div style={{fontSize:12,fontWeight:output.location===o.v?600:400,color:output.location===o.v?C.cy:C.t2}}>{o.l}</div>
                <div style={{fontSize:10,color:C.t3,marginTop:1}}>{o.d}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{marginTop:12,display:"flex",flexDirection:"column",gap:0,borderTop:`1px solid ${C.bd}`}}>
          {[
            {k:"keepOriginal" as const,l:"Keep original file",         d:"Don't delete source after processing"},
            {k:"openWhenDone" as const,l:"Reveal in Finder when done", d:"Auto-open output folder on completion"},
          ].map(({k,l,d},i)=>(
            <label key={k} style={{display:"flex",alignItems:"center",gap:12,padding:"11px 0",cursor:"pointer",borderBottom:`1px solid ${C.bd}`}}>
              <Toggle on={output[k] as boolean} onChange={v=>setOutput({...output,[k]:v})}/>
              <div><div style={{fontSize:12,fontWeight:500,color:C.t2}}>{l}</div><div style={{fontSize:10,color:C.t3,marginTop:1}}>{d}</div></div>
            </label>
          ))}
        </div>
      </div>

      {/* System tools */}
      <div>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
          <SL style={{marginBottom:0}}>System Tools</SL>
          <GBtn onClick={recheck} style={{padding:"2px 7px",fontSize:10,marginLeft:"auto"}}>
            <RefreshCw size={9}/>Recheck
          </GBtn>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:12}}>
          {deps?DEP.map(({k,l,d,c})=>(
            <div key={k} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 12px",borderRadius:7,border:`1px solid ${deps[k]?C.okB:C.erB}`,background:deps[k]?C.okA:C.erA}}>
              <div style={{width:6,height:6,borderRadius:"50%",background:deps[k]?C.ok:C.er,flexShrink:0}}/>
              <div style={{flex:1}}>
                <div style={{fontSize:11,fontWeight:600,color:C.t2}}>{l}</div>
                <div style={{fontSize:10,color:C.t3}}>{d}</div>
              </div>
              <span style={{fontSize:10,fontWeight:700,color:deps[k]?C.ok:C.er}}>{deps[k]?"installed":"missing"}</span>
            </div>
          )):[1,2,3,4].map(i=><Sk key={i} h={42}/>)}
        </div>
        {!allOk&&<PBtn onClick={install} disabled={installing} style={{width:"100%",padding:"10px",fontSize:11,borderRadius:8,marginBottom:8}}>
          <Download size={12}/>{installing?"Installing…":"Auto-install Missing Tools"}
        </PBtn>}
        {allOk&&<div style={{display:"flex",alignItems:"center",gap:8,padding:"9px 12px",borderRadius:7,border:`1px solid ${C.okB}`,background:C.okA}}>
          <CheckCircle size={13} style={{color:C.ok}}/><span style={{fontSize:11,fontWeight:600,color:C.ok}}>All tools installed and ready</span>
        </div>}
      </div>

      {/* Re-run setup */}
      <div>
        <SL>Setup Wizard</SL>
        <GBtn onClick={async()=>{ if(isEl()){await window.electronAPI!.resetSetup(); window.location.reload();} }} style={{width:"100%",padding:"9px",justifyContent:"center",fontSize:11}}>
          <RefreshCw size={11}/>Re-run First-Launch Setup Wizard
        </GBtn>
      </div>

      {/* Manual install */}
      <div>
        <SL>Manual Install Commands</SL>
        {[
          {n:"ffmpeg",                c:C.cy,      cmd:"brew install ffmpeg"},
          {n:"Whisper",               c:C.cyL,     cmd:"pip3 install openai-whisper"},
          {n:"Real-ESRGAN",           c:C.ok,      cmd:"pip3 install realesrgan basicsr"},
          {n:"Demucs (vocal sep.)",   c:C.gd,      cmd:"pip3 install demucs"},
          {n:"XTTS v2 (voice clone)", c:C.gd,      cmd:"pip3 install TTS"},
          {n:"NLLB-200 (translation)",c:"#8B5CF6", cmd:"pip3 install transformers sentencepiece sacremoses"},
          {n:"Audio libs",            c:C.t2,      cmd:"pip3 install soundfile librosa"},
        ].map(({n,c,cmd})=>(
          <div key={n} style={{marginBottom:10}}>
            <div style={{fontSize:9,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase" as const,color:c,marginBottom:5}}>{n}</div>
            <CodeBlock cmd={cmd}/>
          </div>
        ))}
        <div style={{marginTop:8,padding:"8px 12px",borderRadius:7,background:C.cyA,border:`1px solid ${C.bdC}`,fontSize:10,color:C.t3,lineHeight:1.6}}>
          <span style={{color:C.cy,fontWeight:600}}>Tip:</span> Install Homebrew first at brew.sh if you don't have it. Then <code style={{fontFamily:"monospace",color:C.t2}}>brew install ffmpeg</code> covers the most important dependency.
        </div>
      </div>
    </div>
  );
}

// ─── Toast stack ──────────────────────────────────────────────────────────────
function ToastStack({ts,dismiss}:{ts:Toast[];dismiss:(id:string)=>void}) {
  if(!ts.length) return null;
  const CFG={success:{Icon:CheckCircle,color:C.ok,border:C.okB},error:{Icon:AlertCircle,color:C.er,border:C.erB},info:{Icon:Info,color:C.cy,border:C.cyB},warn:{Icon:AlertCircle,color:C.wa,border:`rgba(224,144,32,0.25)`}};
  return (
    <div style={{position:"fixed",bottom:20,right:16,zIndex:9999,display:"flex",flexDirection:"column",gap:7,alignItems:"flex-end"}}>
      {ts.map(t=>{
        const {Icon,color,border}=CFG[t.kind];
        return (
          <div key={t.id} style={{
            display:"flex",alignItems:"flex-start",gap:10,padding:"11px 13px",borderRadius:9,
            background:"#141B24",border:`1px solid ${border}`,borderLeft:`3px solid ${color}`,
            boxShadow:"inset 0 1px 0 rgba(255,255,255,0.04), 0 12px 40px rgba(0,0,0,0.5)",
            fontSize:12,maxWidth:290,
            animation:t.exiting?"slide-out 160ms cubic-bezier(0.23,1,0.32,1) both":"slide-in 200ms cubic-bezier(0.23,1,0.32,1) both",
          }}>
            <Icon size={14} style={{color,flexShrink:0,marginTop:1}}/>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:12,fontWeight:700,color:C.t1,letterSpacing:"-0.01em"}}>{t.title}</div>
              {t.body&&<div style={{fontSize:11,color:C.t2,marginTop:2,lineHeight:1.4}}>{t.body}</div>}
            </div>
            <button onClick={()=>dismiss(t.id)} style={{background:"none",border:"none",cursor:"pointer",color:C.t3,padding:2,flexShrink:0,display:"flex",alignItems:"center"}}><X size={11}/></button>
          </div>
        );
      })}
    </div>
  );
}

// ─── Nav config ───────────────────────────────────────────────────────────────
const NAV:{id:TabId;label:string;Icon:React.ElementType;color:string}[]=[
  {id:"convert",     label:"Convert",        Icon:Film,        color:C.cy},
  {id:"subtitles",   label:"Subtitles",      Icon:Captions,    color:C.cyL},
  {id:"dub",         label:"Hollywood Dub",  Icon:Mic2,        color:C.gd},
  {id:"remaster",    label:"AI Remaster",    Icon:Sparkles,    color:C.gd},
  {id:"interpolate", label:"Smooth Frames",  Icon:TrendingUp,  color:"#8B5CF6"},
  {id:"automate",    label:"Automate",       Icon:Bot,         color:C.ok},
  {id:"jobs",        label:"Jobs",           Icon:Activity,    color:C.cy},
  {id:"settings",    label:"Settings",       Icon:Settings,    color:C.t2},
];

// NavButton extracted so hooks aren't called inside a .map()
function NavButton({id,label,Icon,color,active,badge,onClick}:{
  id:string;label:string;Icon:React.ElementType;color:string;
  active:boolean;badge?:number|null;onClick:()=>void;
}) {
  const {pressed,handlers}=usePressable();
  return (
    <button {...handlers} onClick={onClick} style={{
      display:"flex",alignItems:"center",gap:8,
      padding:"7px 10px",borderRadius:8,
      // Liquid glass active state
      background:active?"rgba(255,32,32,0.08)":pressed?"rgba(255,255,255,0.04)":"transparent",
      border:active?"1px solid rgba(255,32,32,0.18)":"1px solid transparent",
      boxShadow:active?"inset 0 1px 0 rgba(255,32,32,0.06)":"none",
      cursor:"pointer",width:"100%",textAlign:"left" as const,
      fontFamily:"Inter,ui-sans-serif,-apple-system,sans-serif",
      fontSize:12,fontWeight:active?600:400,
      color:active?"#FF5050":C.t2,
      marginBottom:2,
      transition:`background 150ms ${ease.out}, color 150ms ${ease.out}, border-color 150ms ${ease.out}, box-shadow 150ms ${ease.out}`,
      transform:pressed?"scale(0.97)":"scale(1)",
    }}>
      <Icon size={13} style={{flexShrink:0,color:active?"#FF2020":C.t3,transition:`color 150ms ${ease.out}`}}/>
      <span style={{flex:1,letterSpacing:active?"-0.01em":"0"}}>{label}</span>
      {badge!=null&&badge>0&&<span style={{fontSize:9,fontWeight:800,padding:"1px 5px",borderRadius:99,background:"#FF2020",color:"#FFF0F0",fontVariantNumeric:"tabular-nums"}}>{badge}</span>}
    </button>
  );
}

// ─── Setup Wizard ─────────────────────────────────────────────────────────────

interface SysInfo { platform:string;arch:string;os:string;shell:string;shellName:string; }
interface DepCheck { ok:boolean;version:string|null;required:boolean;name:string;desc:string; }
interface CheckResult {
  platform:DepCheck; brew:DepCheck; winpkg:DepCheck;
  ffmpeg:DepCheck; python:DepCheck; whisper:DepCheck; esrgan:DepCheck;
}

function SetupWizard({ onDone }:{ onDone:()=>void }) {
  const [phase, setPhase]       = useState<"checking"|"results"|"installing"|"done">("checking");
  const [sysInfo, setSysInfo]   = useState<SysInfo|null>(null);
  const [checks, setChecks]     = useState<CheckResult|null>(null);
  const [logs, setLogs]         = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const logsRef = useRef<HTMLDivElement>(null);
  const isWin = sysInfo?.platform === "win32";

  // Scroll log to bottom
  useEffect(()=>{
    if(logsRef.current) logsRef.current.scrollTop = logsRef.current.scrollHeight;
  },[logs]);

  // Run check on mount
  useEffect(()=>{
    if(!isEl()) { setPhase("done"); return; }
    (async()=>{
      const [sys, result] = await Promise.all([
        window.electronAPI!.getSystemInfo(),
        window.electronAPI!.checkAllDeps(),
      ]);
      setSysInfo(sys);
      setChecks(result);
      // Pre-select missing required tools, plus brew if on mac and missing
      const missing:string[] = [];
      if(!result.ffmpeg.ok)  missing.push("ffmpeg");
      if(!result.python.ok)  missing.push("python");
      if(!result.brew?.ok && sys.platform==="darwin") missing.push("brew");
      setSelected(missing);
      setPhase("results");
    })();
  },[]);

  // Listen to install progress
  useEffect(()=>{
    if(!isEl()) return;
    window.electronAPI!.onSetupProgress((d:{ msg:string; status:string })=>{
      setLogs(p=>[...p.slice(-200), d.msg]);
      if(d.status==="done") setPhase("done");
    });
  },[]);

  const startInstall = async () => {
    if(!selected.length) { setPhase("done"); return; }
    setPhase("installing");
    setLogs([`Using shell: ${sysInfo?.shell || "system default"}`, "Starting installation…"]);
    if(isEl()) window.electronAPI!.installTools(selected);
  };

  const finish = async () => {
    if(isEl()) await window.electronAPI!.markSetupComplete();
    onDone();
  };

  const checkRow = (key:string, item:DepCheck|undefined) => {
    if(!item) return null;
    const isSel = selected.includes(key);
    const show = !isWin ? key !== "winpkg" : key !== "brew";
    if(!show || (!item.required && item.ok)) return null; // hide optional if already installed
    return (
      <div key={key} style={{
        display:"flex",alignItems:"center",gap:12,padding:"10px 14px",
        background: item.ok ? C.okA : isSel ? C.erA : "rgba(255,255,255,0.02)",
        border:`1px solid ${item.ok?C.okB:isSel?C.erB:C.bd}`,
        borderRadius:8,cursor:item.ok?"default":"pointer",
        transition:`background 150ms ${ease.out}`,
      }}
        onClick={()=>{ if(!item.ok) setSelected(p=>p.includes(key)?p.filter(x=>x!==key):[...p,key]); }}
      >
        <div style={{width:22,height:22,borderRadius:6,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",background:item.ok?C.okA:C.erA,border:`1px solid ${item.ok?C.okB:C.erB}`}}>
          {item.ok ? <CheckCircle size={12} style={{color:C.ok}}/> : <Download size={12} style={{color:C.er}}/>}
        </div>
        <div style={{flex:1}}>
          <div style={{fontSize:12,fontWeight:600,color:item.ok?C.ok:C.t1}}>{item.name}{item.version&&<span style={{fontWeight:400,color:C.t3,marginLeft:6,fontSize:10}}>v{item.version}</span>}</div>
          <div style={{fontSize:10,color:C.t3}}>{item.desc}</div>
        </div>
        {!item.ok&&(
          <div style={{width:16,height:16,borderRadius:3,background:isSel?C.er:"transparent",border:`1.5px solid ${isSel?C.er:C.t3}`,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
            {isSel&&<Check size={10} style={{color:"#fff"}}/>}
          </div>
        )}
        {!item.ok&&!item.required&&<span style={{fontSize:9,fontWeight:700,color:C.t3,letterSpacing:"0.08em"}}>OPTIONAL</span>}
      </div>
    );
  };

  const allRequiredOk = checks && checks.ffmpeg.ok && checks.python.ok;

  return (
    <div style={{
      position:"fixed",inset:0,zIndex:10000,
      background:C.bgBase,
      display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
      padding:32,
      fontFamily:"inherit",
    }}>
      {/* Logo + title */}
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:8}}>
        <div style={{width:36,height:36,borderRadius:10,background:"linear-gradient(135deg,#007F99,#00C9F0)",border:"1px solid rgba(0,201,240,0.5)",boxShadow:"inset 0 1px 0 rgba(255,255,255,0.2)",display:"flex",alignItems:"center",justifyContent:"center"}}>
          <Film size={18} color="#000B10"/>
        </div>
        <div>
          <div style={{fontSize:18,fontWeight:800,color:C.t1,letterSpacing:"-0.04em"}}>PerfectMedia</div>
          <div style={{fontSize:11,color:C.t3}}>First-time setup</div>
        </div>
      </div>

      <div style={{width:"100%",maxWidth:480,display:"flex",flexDirection:"column",gap:12}}>

        {/* System info row */}
        {sysInfo&&(
          <div style={{display:"flex",gap:8,flexWrap:"wrap" as const}}>
            {[
              {Icon:Cpu,   label:sysInfo.os},
              {Icon:Terminal, label:sysInfo.shellName},
              {Icon:Shield,label:sysInfo.arch},
            ].map(({Icon,label})=>(
              <div key={label} style={{display:"flex",alignItems:"center",gap:5,padding:"3px 8px",borderRadius:99,background:C.cyA,border:`1px solid ${C.bdC}`,fontSize:10,color:C.cy}}>
                <Icon size={9}/>{label}
              </div>
            ))}
          </div>
        )}

        {/* Checking spinner */}
        {phase==="checking"&&(
          <div style={{display:"flex",alignItems:"center",gap:10,padding:20,color:C.t2,fontSize:12}}>
            <RefreshCw size={14} style={{color:C.cy,animation:"spin 0.8s linear infinite"}}/> Scanning your system…
          </div>
        )}

        {/* Results — checklist */}
        {(phase==="results"||phase==="done")&&checks&&(
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            <div style={{fontSize:11,fontWeight:700,color:C.t3,letterSpacing:"0.08em",textTransform:"uppercase" as const,marginBottom:4}}>
              {allRequiredOk?"All required tools found":"Select tools to install"}
            </div>
            {checkRow("brew",    checks.brew)}
            {checkRow("winpkg",  checks.winpkg)}
            {checkRow("ffmpeg",  checks.ffmpeg)}
            {checkRow("python",  checks.python)}
            {checkRow("whisper", checks.whisper)}
            {checkRow("esrgan",  checks.esrgan)}
          </div>
        )}

        {/* Installing — live log */}
        {phase==="installing"&&(
          <div>
            <div style={{fontSize:11,fontWeight:700,color:C.t3,letterSpacing:"0.08em",textTransform:"uppercase" as const,marginBottom:6,display:"flex",alignItems:"center",gap:6}}>
              <RefreshCw size={10} style={{animation:"spin 0.8s linear infinite",color:C.cy}}/>Installing…
            </div>
            <div ref={logsRef} style={{
              height:180,overflowY:"auto",padding:"8px 12px",borderRadius:8,
              background:C.bgDeep,border:`1px solid ${C.bd}`,
              fontFamily:"'SF Mono',Menlo,monospace",fontSize:10,color:C.t2,lineHeight:1.8,
            }}>
              {logs.map((l,i)=>(
                <div key={i} style={{color:l.startsWith("✓")?C.ok:l.startsWith("✖")?C.er:l.startsWith("▶")?C.cy:C.t2}}>{l}</div>
              ))}
            </div>
          </div>
        )}

        {/* Done log */}
        {phase==="done"&&logs.length>0&&(
          <div ref={logsRef} style={{height:100,overflowY:"auto",padding:"8px 12px",borderRadius:8,background:C.bgDeep,border:`1px solid ${C.bd}`,fontFamily:"'SF Mono',Menlo,monospace",fontSize:10,color:C.t2,lineHeight:1.8}}>
            {logs.slice(-20).map((l,i)=>(
              <div key={i} style={{color:l.startsWith("✓")?C.ok:l.startsWith("✖")?C.er:l.startsWith("▶")?C.cy:C.t2}}>{l}</div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div style={{display:"flex",gap:8,marginTop:4}}>
          {phase==="results"&&(
            <>
              {selected.length>0&&(
                <PBtn onClick={startInstall} style={{flex:1,padding:"11px",fontSize:12,borderRadius:9}}>
                  <Download size={13}/>Install {selected.length} Tool{selected.length>1?"s":""} & Continue
                </PBtn>
              )}
              {(selected.length===0||allRequiredOk)&&(
                <PBtn onClick={finish} style={{flex:1,padding:"11px",fontSize:12,borderRadius:9,background:"linear-gradient(135deg,#006B40,#00C896)",border:`1px solid ${C.okB}`,color:"#001A0D"}}>
                  <CheckCircle size={13}/>Continue to PerfectMedia
                </PBtn>
              )}
              {selected.length===0&&!allRequiredOk&&(
                <GBtn onClick={finish} style={{flex:1,padding:"10px",fontSize:11}}>
                  Skip for now
                </GBtn>
              )}
            </>
          )}
          {phase==="done"&&(
            <PBtn onClick={finish} style={{flex:1,padding:"11px",fontSize:12,borderRadius:9,background:"linear-gradient(135deg,#006B40,#00C896)",border:`1px solid ${C.okB}`,color:"#001A0D"}}>
              <CheckCircle size={13}/>Launch PerfectMedia →
            </PBtn>
          )}
        </div>

        {/* Skip link */}
        {(phase==="results"||phase==="checking")&&(
          <button onClick={finish} style={{background:"none",border:"none",cursor:"pointer",color:C.t3,fontSize:10,marginTop:2,textAlign:"center" as const}}>
            Skip setup — I'll install tools manually
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [showSetup, setShowSetup] = useState<boolean|null>(null); // null = loading
  const [tab,    setTab]  = useState<TabId>("convert");
  const [folder, setFld]  = useState("");
  const [files,  setFiles]= useState<MediaFile[]>([]);
  const [scan,   setScan] = useState<ScanState>("idle");
  const [jobs,   setJobs] = useState<Job[]>([]);
  const [output, setOut]  = useState<OutputSettings>(DOUT);
  const [deps,    setDeps]    = useState<DepStatus|null>(null);
  const [dubDeps, setDubDeps] = useState<DubDeps|null>(null);
  const {toasts,push:toast,dismiss}=useToasts();

  // Check first launch on mount + load dub deps
  useEffect(()=>{
    if(!isEl()){ setShowSetup(false); return; }
    window.electronAPI!.isFirstLaunch().then(first=>setShowSetup(first));
    window.electronAPI!.checkDubDeps().then(setDubDeps);
  },[]);

  // Progress listener — single registration
  useEffect(()=>{
    if(!isEl()) return;
    window.electronAPI!.onProgress((d:ProgressData)=>{
      setJobs(p=>p.map(j=>j.id!==d.jobId?j:{...j,progress:d.progress,status:d.status,
        log:d.log?[...j.log.slice(-100),d.log]:j.log,
      }));
    });
    return ()=>{ if(isEl()) window.electronAPI!.removeListeners(); };
  },[]);

  const doScan=useCallback(async(p:string)=>{
    setScan("scanning");
    try {
      if(isEl()){
        const r=await window.electronAPI!.scanFolder(p);
        setFiles(r);
        setScan("done");
      } else {
        await new Promise(r=>setTimeout(r,700));
        setFiles(MOCK.map(f=>({...f})));
        setScan("done");
      }
    } catch {
      setScan("error");
      toast({kind:"error",title:"Scan failed",body:"Check folder permissions and try again"});
    }
  },[toast]);

  const openFolder=useCallback(async()=>{
    if(isEl()){
      const p=await window.electronAPI!.selectFolder();
      if(p){ setFld(p); doScan(p); }
    } else {
      setFld("/Users/demo/Movies");
      doScan("/Users/demo/Movies");
    }
  },[doScan]);

  const addJob=(j:Job)=>{ setJobs(p=>[j,...p.slice(0,99)]); setTab("jobs"); };
  const cancelJob=async(id:string)=>{
    setJobs(p=>p.map(j=>j.id===id?{...j,status:"cancelled"}:j));
    toast({kind:"warn",title:"Job cancelled"});
    if(isEl()) window.electronAPI!.cancelJob(id);
  };

  const running=jobs.filter(j=>j.status==="running").length;
  const shortFld=folder?(folder.split("/").pop()||folder):null;
  const tp={files,scanState:scan,onOpen:openFolder,out:output,onJob:addJob,onGoSettings:()=>setTab("settings"),toast,deps};

  // Show setup wizard on first launch (null = still loading)
  if(showSetup===null) return (
    <div style={{height:"100vh",background:C.bgBase,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <RefreshCw size={18} style={{color:C.cy,animation:"spin 0.8s linear infinite"}}/>
    </div>
  );
  if(showSetup) return <SetupWizard onDone={()=>setShowSetup(false)}/>;

  return (
    <div style={{height:"100vh",display:"flex",flexDirection:"column",background:C.bgBase,overflow:"hidden",userSelect:"none" as const}}>

      {/* Titlebar — Liquid Glass strip */}
      <div style={{
        height:46,display:"flex",alignItems:"center",paddingLeft:80,paddingRight:14,gap:10,flexShrink:0,
        ...glass(0.025, 20),
        borderTop:"none",borderLeft:"none",borderRight:"none",
        borderBottom:`1px solid rgba(255,255,255,0.05)`,
        boxShadow:"0 1px 0 rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04)",
        WebkitAppRegion:"drag",
      } as React.CSSProperties}>
        {/* Tesla-inspired logo mark */}
        <div style={{
          width:26,height:26,borderRadius:7,flexShrink:0,
          background:"#08090E",
          border:"1px solid rgba(255,255,255,0.12)",
          boxShadow:"inset 0 1px 0 rgba(255,255,255,0.08), 0 2px 8px rgba(0,0,0,0.5)",
          display:"flex",alignItems:"center",justifyContent:"center",
          overflow:"hidden",
          WebkitAppRegion:"no-drag",
        } as React.CSSProperties}>
          {/* Mini logo: play triangle + red line */}
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            {/* Film frame top marks */}
            <rect x="1" y="1" width="3" height="2" rx="0.5" fill="rgba(255,255,255,0.3)"/>
            <rect x="6" y="1" width="3" height="2" rx="0.5" fill="rgba(255,255,255,0.3)"/>
            <rect x="12" y="1" width="3" height="2" rx="0.5" fill="rgba(255,255,255,0.3)"/>
            {/* Film frame bottom marks */}
            <rect x="1" y="15" width="3" height="2" rx="0.5" fill="rgba(255,255,255,0.3)"/>
            <rect x="6" y="15" width="3" height="2" rx="0.5" fill="rgba(255,255,255,0.3)"/>
            <rect x="12" y="15" width="3" height="2" rx="0.5" fill="rgba(255,255,255,0.3)"/>
            {/* Screen area */}
            <rect x="1" y="4" width="16" height="10" rx="1.5" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.1)" strokeWidth="0.5"/>
            {/* Red scan line */}
            <rect x="1" y="8.5" width="16" height="1" rx="0.5" fill="#FF2020"/>
            {/* Play triangle */}
            <path d="M 6 5.5 L 6 12.5 L 13 9 Z" fill="white" fillOpacity="0.92"/>
          </svg>
        </div>

        {/* App name — tight tracking, weight 700 */}
        <span style={{
          fontSize:14,fontWeight:700,color:C.t1,letterSpacing:"-0.04em",
          fontFamily:"Inter,ui-sans-serif,-apple-system,sans-serif",
          WebkitAppRegion:"no-drag",
        } as React.CSSProperties}>
          PerfectMedia
        </span>

        {running>0&&(
          <div style={{display:"flex",alignItems:"center",gap:5,padding:"2px 8px",borderRadius:99,background:`rgba(224,144,32,0.1)`,border:`1px solid rgba(224,144,32,0.2)`,WebkitAppRegion:"no-drag"} as React.CSSProperties}>
            <div style={{width:5,height:5,borderRadius:"50%",background:C.wa,animation:"pulse-dot 1.2s ease-in-out infinite"}}/>
            <span style={{fontSize:10,fontWeight:600,color:C.wa}}>{running} running</span>
          </div>
        )}

        <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:7,WebkitAppRegion:"no-drag"} as React.CSSProperties}>
          {folder&&(
            <div style={{fontSize:10,color:C.t3,padding:"2px 9px",borderRadius:99,background:`rgba(0,201,240,0.06)`,border:`1px solid ${C.bdC}`}}>
              <span style={{color:C.cy,fontWeight:600}}>{shortFld}</span>
              {scan==="done"&&<span style={{color:C.t4,marginLeft:6,fontVariantNumeric:"tabular-nums"}}>{files.length} files</span>}
            </div>
          )}
          <GBtn onClick={openFolder} style={{gap:5,fontSize:11,padding:"5px 11px"}}>
            <FolderOpen size={11} style={{color:C.cy}}/>{shortFld?"Change folder":"Open folder"}
          </GBtn>
          {folder&&(
            <GBtn onClick={()=>doScan(folder)} style={{padding:"5px 8px",width:28,height:28}}>
              <RefreshCw size={11} style={{color:scan==="error"?C.er:C.cy,animation:scan==="scanning"?"spin 0.8s linear infinite":"none"}}/>
            </GBtn>
          )}
        </div>
      </div>

      {/* Body */}
      <div style={{flex:1,display:"flex",overflow:"hidden"}}>

        {/* Sidebar — Liquid Glass panel */}
        <div style={{
          width:176,flexShrink:0,
          ...glass(0.02, 32),
          borderTop:"none",borderBottom:"none",borderLeft:"none",
          borderRight:`1px solid rgba(255,255,255,0.05)`,
          boxShadow:"inset -1px 0 0 rgba(255,255,255,0.04), 1px 0 12px rgba(0,0,0,0.3)",
          display:"flex",flexDirection:"column",padding:"14px 8px 14px",overflowY:"auto",
          background:"rgba(6,7,12,0.80)",
        }}>
          <div style={{marginBottom:16}}>
            <SL style={{padding:"0 6px",marginBottom:6}}>Process</SL>
            {NAV.slice(0,6).map(({id,label,Icon,color})=>(
              <NavButton key={id} id={id} label={label} Icon={Icon} color={color}
                active={tab===id} onClick={()=>setTab(id)}/>
            ))}
          </div>

          <div style={{marginBottom:16}}>
            <SL style={{padding:"0 6px",marginBottom:6}}>Monitor</SL>
            {NAV.slice(6).map(({id,label,Icon,color})=>(
              <NavButton key={id} id={id} label={label} Icon={Icon} color={color}
                active={tab===id} badge={id==="jobs"&&running>0?running:null}
                onClick={()=>setTab(id)}/>
            ))}
          </div>

          {/* Dep status chip in sidebar */}
          {deps&&(!deps.ffmpeg||!deps.whisper)&&(
            <div
              onClick={()=>setTab("settings")}
              style={{
                padding:"7px 10px",borderRadius:7,background:C.erA,border:`1px solid ${C.erB}`,
                cursor:"pointer",marginBottom:10,
              }}>
              <div style={{fontSize:10,fontWeight:600,color:C.er,marginBottom:2}}>Missing tools</div>
              <div style={{fontSize:9,color:C.t3}}>Click Settings to install</div>
            </div>
          )}

          {files.length>0&&(
            <div style={{marginTop:"auto",padding:"8px 10px",borderTop:`1px solid ${C.bd}`}}>
              <SL style={{marginBottom:6}}>Folder</SL>
              {[{n:files.length,l:"total files",c:C.t2},{n:files.filter(f=>NON_MP4.has(f.ext)).length,l:"non-MP4",c:C.cy},{n:files.filter(f=>!f.hasSrt).length,l:"no SRT",c:C.cyL}].map(({n,l,c})=>(
                <div key={l} style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                  <span style={{fontSize:10,color:C.t3}}>{l}</span>
                  <span style={{fontSize:10,fontWeight:700,color:c,fontVariantNumeric:"tabular-nums"}}>{n}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Main panel — subtle atmospheric background */}
        <div style={{flex:1,overflowY:"auto",padding:"22px 22px 32px",background:C.bgBase}}>
          <div style={{marginBottom:20}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4}}>
              {(()=>{ const n=NAV.find(x=>x.id===tab); if(!n) return null; const Icon=n.Icon; return (
                <div style={{width:28,height:28,borderRadius:8,...glass(0.04,12),display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  <Icon size={14} style={{color:n.color}}/>
                </div>
              ); })()}
              {/* H1 scale: 22px / 700 / -0.03em */}
              <h1 style={{fontSize:22,fontWeight:800,color:C.t1,letterSpacing:"-0.04em",lineHeight:1,fontFamily:"Inter,ui-sans-serif,-apple-system,sans-serif"}}>{NAV.find(n=>n.id===tab)?.label}</h1>
            </div>
            {/* Subtitle scale: 12px / 400 */}
            <div style={{fontSize:12,color:C.t3,marginLeft:38,fontFamily:"Inter,ui-sans-serif,-apple-system,sans-serif",letterSpacing:"-0.01em"}}>
              {tab==="convert"     &&"Convert video files to any format — H.264, H.265, ProRes, VP9, lossless codecs"}
              {tab==="subtitles"   &&"Transcribe and translate subtitles with Whisper AI — 43 languages, fully offline"}
              {tab==="dub"         &&"Hollywood-grade voice dubbing — voice cloning, lip sync, background preservation"}
              {tab==="remaster"    &&"AI-upscale video to FHD, 4K or 8K cinema quality with Real-ESRGAN"}
              {tab==="interpolate" &&"Multiply frame rate to 2×, 4×, or 8× with RIFE neural interpolation"}
              {tab==="automate"    &&"Run multiple operations across your entire media folder at once"}
              {tab==="jobs"        &&"Track all active and completed processing jobs with live pipeline view"}
              {tab==="settings"    &&"Output folder, preferences, dependencies, and dubbing engine status"}
            </div>
          </div>

          {tab==="convert"     &&<ConvertTab     {...tp}/>}
          {tab==="subtitles"   &&<SubtitlesTab   {...tp}/>}
          {tab==="dub"         &&<DubTab         {...tp} dubDeps={dubDeps}/>}
          {tab==="remaster"    &&<RemasterTab    {...tp}/>}
          {tab==="interpolate" &&<InterpolateTab {...tp}/>}
          {tab==="automate"    &&<AutomateTab    {...tp} folder={folder}/>}
          {tab==="jobs"        &&<JobsTab        jobs={jobs} onCancel={cancelJob} toast={toast}/>}
          {tab==="settings"    &&<SettingsTab    output={output} setOutput={setOut} toast={toast} deps={deps} setDeps={setDeps}/>}
        </div>
      </div>

      <ToastStack ts={toasts} dismiss={dismiss}/>
    </div>
  );
}
