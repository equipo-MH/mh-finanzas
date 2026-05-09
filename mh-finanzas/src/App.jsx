import { useState, useEffect, useCallback, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

// ── Notion DB IDs ─────────────────────────────────────────────
const DB_IDS = {
  personal:      "d53edbb031404fbe9247516b86b54d83",
  compartido:    "4a59e3a1c4034368b92e9cd6884b19ec",
  mh:            "2c0de50f21d6802fbc8ff6570cad8a26",
  cuotas:        "d5dfcfdd2b4b47d6acadf0cbe18da696",
  colaboradores: "2c4de50f21d68080ae45d6b52cfed9ef",
  honorarios:    "2768b3bd16524154a127fedd7f00e22b",
  pagosColab:    "f784cf3598d34f1e9e687da984cbd4b8",
  proyectos:     "2c0de50f21d6807b8e79000b866a9eda",
};

const NOTION_TOKEN_KEY    = "mh_notion_token";
const ANTHROPIC_KEY_STORAGE = "mh_anthropic_key";
const CFG_KEY             = "mh-fin-cfg-v5";

const getStoredToken      = () => { try { return localStorage.getItem(NOTION_TOKEN_KEY); } catch { return null; } };
const getStoredAnthropicKey = () => { try { return localStorage.getItem(ANTHROPIC_KEY_STORAGE); } catch { return null; } };

// ── Constants ─────────────────────────────────────────────────
const CATS = {
  personal:   ["Comida","Transporte","Salud","Ocio","Ropa","Suscripciones","Educación","Otros"],
  compartido: ["Vivienda","Comida","Servicios","Salud","Ocio","Transporte","Otros"],
  mh:         ["Materiales obra","Materiales mobiliario","Mano de obra / Colaboradores",
               "Honorarios profesionales","Combustible / Logística","Herramientas / Inversión",
               "Marketing / Comunicación","Impuestos / Tasas","Alquiler / Servicios / Taller",
               "Ventas / Proyectos","Varios"],
};
const METODOS   = ["Débito","Crédito","Efectivo","Transferencia","MercadoPago"];
const CUOTAS_OPT = [1,2,3,6,12,18,24];
const MESES     = ["ENE","FEB","MAR","ABR","MAY","JUN","JUL","AGO","SEP","OCT","NOV","DIC"];
const CAT_COLORS = ["#B85C2A","#5C7A8A","#4A6A5A","#8A5C3A","#5C5A8A","#7A5C5A","#4A7A6A","#8A7A5C"];

// ── Design tokens ─────────────────────────────────────────────
const T = {
  cream:"#F4F1EB", paper:"#EDEAE2", rule:"#D4D0C7", ruleL:"#E5E2D8",
  ink:"#1A1917", inkMid:"#5C5A54", inkDim:"#9C9990",
  accent:"#B85C2A", accentL:"#F5EBE3",
  pos:"#2A6647", posL:"#DAF0E4",
  neg:"#8A2A2A", negL:"#F5DADA",
  warn:"#7A5C10", warnL:"#FDF4DC",
  sans:"'Instrument Sans','Helvetica Neue',Arial,sans-serif",
  mono:"'JetBrains Mono','Courier New',monospace",
  disp:"'Syne','Helvetica Neue',Arial,sans-serif",
};

// ── Helpers ───────────────────────────────────────────────────
const ars     = n => "$\u202F"+new Intl.NumberFormat("es-AR",{minimumFractionDigits:0}).format(Math.round(Math.abs(n)));
const signStr = n => (n>=0?"+":"-")+" "+new Intl.NumberFormat("es-AR",{minimumFractionDigits:0}).format(Math.round(Math.abs(n)));
const pct     = (a,b) => b ? Math.round((a/b)*100) : 0;
const today   = () => new Date().toISOString().split("T")[0];
const monthOf = e => e.fecha?.slice(0,7) ?? today().slice(0,7);
const prevMonth = () => { const d=new Date(); d.setMonth(d.getMonth()-1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; };
const addMonths = (dateStr, n) => { const d=new Date(dateStr+"T12:00:00"); d.setMonth(d.getMonth()+n); return d.toISOString().split("T")[0]; };
const daysUntil = dateStr => { if(!dateStr) return null; const d=new Date(dateStr+"T12:00:00"); return Math.round((d-new Date())/(1000*60*60*24)); };

// ── Notion API (via proxy) ────────────────────────────────────
async function queryDB(dbId, type, token) {
  try {
    const res = await fetch(`/api?action=query`, {
      method:"POST",
      headers:{"Content-Type":"application/json","x-notion-token":token},
      body:JSON.stringify({dbId, type}),
    });
    const data = await res.json();
    if(data.error) return {error:data.error};
    return Array.isArray(data) ? data : [];
  } catch(e) { return {error:String(e)}; }
}

async function createPage(dbId, properties, token) {
  try {
    const res = await fetch(`/api?action=create`, {
      method:"POST",
      headers:{"Content-Type":"application/json","x-notion-token":token},
      body:JSON.stringify({dbId, properties}),
    });
    return res.json();
  } catch(e) { return {error:String(e)}; }
}

async function updatePage(pageId, properties, token) {
  try {
    const res = await fetch(`/api?action=update`, {
      method:"POST",
      headers:{"Content-Type":"application/json","x-notion-token":token},
      body:JSON.stringify({pageId, properties}),
    });
    return res.json();
  } catch(e) { return {error:String(e)}; }
}

// ── Build Notion properties ───────────────────────────────────
function notionProps(bucket, data) {
  const title = (n,v) => ({[n]:{title:[{text:{content:String(v)}}]}});
  const num   = (n,v) => ({[n]:{number:Number(v)||0}});
  const sel   = (n,v) => ({[n]:{select:{name:String(v)}}});
  const msel  = (n,v) => ({[n]:{multi_select:[{name:String(v)}]}});
  const date  = (n,v) => ({[n]:{date:{start:v}}});
  const txt   = (n,v) => ({[n]:{rich_text:[{text:{content:String(v||"")}}]}});

  if(bucket==="personal") return {
    ...title("Descripción",data.desc), ...num("Monto",data.monto),
    ...sel("Categoría",data.cat), ...date("Fecha",data.fecha),
    ...(data.metodo?sel("Método de pago",data.metodo):{})
  };
  if(bucket==="compartido") return {
    ...title("Descripción",data.desc), ...num("Monto",data.monto),
    ...sel("Pagó",data.pago), ...sel("Categoría",data.cat),
    ...date("Fecha",data.fecha), ...sel("División","50/50"),
    ...sel("Estado",data.estado||"Pendiente")
  };
  if(bucket==="mh") return {
    ...title("Movimiento",data.desc), ...num("Monto",data.monto),
    ...sel("Tipo",data.mhTipo==="Ingreso"?"Ingreso":"Egreso"),
    ...msel("Categoría",data.cat), ...date("Fecha",data.fecha), ...sel("Moneda","ARS")
  };
  if(bucket==="cuota") return {
    ...title("Descripción",data.desc),
    ...num("Monto cuota",data.montoCuota),
    ...num("Cuota N°",data.cuotaN),
    ...num("Total cuotas",data.totalCuotas),
    ...sel("Tarjeta",data.tarjeta),
    ...date("Fecha compra",data.fechaCompra),
    ...date("Mes débito",data.mesDebito),
    ...sel("Estado","Pendiente"),
    ...txt("Grupo ID",data.grupoId),
    ...txt("Descripción original",data.descOriginal),
  };
  if(bucket==="honorario") return {
    ...title("Descripción",`${data.colaborador} — ${data.proyecto}`),
    ...txt("Colaborador",data.colaborador),
    ...txt("Proyecto",data.proyecto),
    ...num("Monto pactado",data.montoPactado),
    ...num("Total adelantado",0),
    ...date("Fecha inicio",data.fechaInicio||today()),
    ...sel("Estado","En curso"),
    ...txt("Notas",data.notas||""),
  };
  if(bucket==="pagoColab") return {
    ...title("Descripción",`Pago a ${data.colaborador}`),
    ...txt("Colaborador",data.colaborador),
    ...txt("Proyecto",data.proyecto||""),
    ...num("Monto",data.monto),
    ...date("Fecha",data.fecha||today()),
    ...sel("Tipo",data.tipo||"Adelanto"),
    ...sel("Método",data.metodo||"Transferencia"),
    ...txt("Notas",data.notas||""),
  };
  if(bucket==="colaborador") return {
    ...title("Colaborador",data.nombre),
    ...(data.especialidad?msel("Rol",data.especialidad):{...msel("Rol","Producción / Taller")}),
    ...sel("Estado","Activo"),
  };
  return {};
}

// ── Claude via proxy ──────────────────────────────────────────
async function claudeCall(system, messages, max_tokens=1200) {
  try {
    const res = await fetch("/api?action=claude",{
      method:"POST", headers:{"Content-Type":"application/json"},
      body:JSON.stringify({system,messages,max_tokens}),
    });
    if(res.ok){ const d=await res.json(); if(!d.error) return (d.content||[]).filter(b=>b.type==="text").map(b=>b.text).join(""); }
    const key = getStoredAnthropicKey();
    if(!key) return "(Asesor no disponible — configurá la API key en el setup)";
    const r = await fetch("https://api.anthropic.com/v1/messages",{
      method:"POST",
      headers:{"Content-Type":"application/json","x-api-key":key,"anthropic-version":"2023-06-01"},
      body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens,system,messages}),
    });
    const d = await r.json();
    return (d.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("");
  } catch(e){ return "Error: "+e; }
}

async function parseVoiceInput(transcript) {
  try {
    const text = await claudeCall(
      `Parser de gastos financieros para Mariano Serdoch (Argentina). Devolvés SOLO JSON válido sin markdown.
Categorías personal: Comida,Transporte,Salud,Ocio,Ropa,Suscripciones,Educación,Otros
Categorías compartido: Vivienda,Comida,Servicios,Salud,Ocio,Transporte,Otros
Categorías mh: Materiales obra,Materiales mobiliario,Mano de obra / Colaboradores,Honorarios profesionales,Combustible / Logística,Herramientas / Inversión,Marketing / Comunicación,Impuestos / Tasas,Alquiler / Servicios / Taller,Ventas / Proyectos,Varios
meinhaus/MH/obra/taller→mh | alquiler/expensas/con flor→compartido | resto→personal
50k/50 lucas=50000, 3 millones=3000000`,
      [{role:"user",content:`Parsear: "${transcript}". JSON: {"desc":"...","monto":0,"bucket":"personal|compartido|mh","cat":"...","pago":"Mariano","mhTipo":"Egreso"}`}],
      300
    );
    const si=text.indexOf("{"), ei=text.lastIndexOf("}");
    return JSON.parse(si>=0?text.slice(si,ei+1):text);
  } catch{ return null; }
}

// ── Stats ─────────────────────────────────────────────────────
function buildStats(all, cuotas) {
  const personal   = all.filter(e=>e.bucket==="personal");
  const mh         = all.filter(e=>e.bucket==="mh");
  const comp       = all.filter(e=>e.bucket==="compartido");
  const mhIng      = mh.filter(e=>e.sub==="ingreso").reduce((s,e)=>s+e.monto,0);
  const mhEgr      = mh.filter(e=>e.sub==="egreso").reduce((s,e)=>s+e.monto,0);
  const persEgr    = personal.reduce((s,e)=>s+e.monto,0);

  const moMap={};
  all.forEach(e=>{
    const m=monthOf(e);
    if(!moMap[m]) moMap[m]={label:MESES[(parseInt(m.split("-")[1])||1)-1],persEgr:0,mhIng:0,mhEgr:0};
    if(e.bucket==="personal")              moMap[m].persEgr+=e.monto;
    if(e.bucket==="mh"&&e.sub==="ingreso") moMap[m].mhIng+=e.monto;
    if(e.bucket==="mh"&&e.sub==="egreso")  moMap[m].mhEgr+=e.monto;
  });
  const months=Object.entries(moMap).sort(([a],[b])=>a.localeCompare(b)).map(([,v])=>v);

  const catMap={}, mhCatMap={};
  personal.forEach(e=>{catMap[e.cat||"Otros"]=(catMap[e.cat||"Otros"]||0)+e.monto;});
  mh.filter(e=>e.sub==="egreso").forEach(e=>{mhCatMap[e.cat||"Varios"]=(mhCatMap[e.cat||"Varios"]||0)+e.monto;});
  const catData   = Object.entries(catMap).map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value);
  const mhCatData = Object.entries(mhCatMap).map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value);

  const g=comp.filter(e=>e.sub==="gasto");
  const mp=g.filter(e=>e.pago==="Mariano").reduce((s,e)=>s+e.monto,0);
  const fp=g.filter(e=>e.pago==="Flor").reduce((s,e)=>s+e.monto,0);
  const tot=mp+fp, raw=(tot/2)-mp;
  const deb=raw>=0?"Mariano":"Flor", cred=raw>=0?"Flor":"Mariano";
  const sett=comp.filter(e=>e.sub==="ajuste"&&e.pago===deb).reduce((s,e)=>s+e.monto,0);

  // Cuotas pendientes
  const cuotasPend = (cuotas||[]).filter(c=>c.estado==="Pendiente");
  const cuotasTotal = cuotasPend.reduce((s,c)=>s+c.montoCuota,0);

  return {mhIng,mhEgr,mhNeto:mhIng-mhEgr,persEgr,months,catData,mhCatData,
          balOut:Math.max(0,Math.abs(raw)-sett),balDeb:deb,balCred:cred,mp,fp,tot,
          cuotasPend,cuotasTotal};
}

// ── CSS ───────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700&family=Instrument+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{background:${T.cream};color:${T.ink};-webkit-font-smoothing:antialiased}
.num{font-family:${T.mono};font-variant-numeric:tabular-nums;letter-spacing:-0.02em}
input,select,textarea{font-family:${T.sans};color:${T.ink};background:${T.cream}}
input:focus,select:focus,textarea:focus{outline:2px solid ${T.accent};outline-offset:-1px}
button{cursor:pointer;transition:opacity 0.1s}
button:hover{opacity:0.7}
button:active{opacity:0.5}
.spin{animation:spin 0.9s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.fade{animation:fi 0.18s ease}
@keyframes fi{from{opacity:0;transform:translateY(3px)}to{opacity:1;transform:none}}
.pending{opacity:0.55;animation:pulse 1.4s ease-in-out infinite}
@keyframes pulse{0%,100%{opacity:0.55}50%{opacity:0.9}}
@keyframes voicePulse{0%,100%{box-shadow:0 0 0 0 rgba(184,92,42,0.4)}50%{box-shadow:0 0 0 8px rgba(184,92,42,0)}}
::-webkit-scrollbar{width:3px}
::-webkit-scrollbar-thumb{background:${T.rule}}
`;

// ── Setup Screen ──────────────────────────────────────────────
function SetupScreen({onToken}) {
  const [token,   setToken]   = useState("");
  const [apiKey,  setApiKey]  = useState("");
  const [testing, setTesting] = useState(false);
  const [err,     setErr]     = useState("");
  const inpS = {width:"100%",padding:"10px 12px",border:`1.5px solid ${T.rule}`,
                background:T.cream,fontSize:13,color:T.ink,fontFamily:T.mono,boxSizing:"border-box"};
  const lbl  = {fontSize:10,color:T.inkDim,letterSpacing:"0.08em",textTransform:"uppercase",display:"block",marginBottom:6};

  const test = async() => {
    if(!token.trim()){ setErr("Pegá el token de Notion"); return; }
    setTesting(true); setErr("");
    try {
      const res = await queryDB(DB_IDS.personal, "personal", token.trim());
      if(res?.error){ setErr("Sin acceso. ¿Conectaste la integración a las bases? Error: "+res.error); setTesting(false); return; }
      try {
        localStorage.setItem(NOTION_TOKEN_KEY, token.trim());
        if(apiKey.trim()) localStorage.setItem(ANTHROPIC_KEY_STORAGE, apiKey.trim());
      } catch {}
      onToken(token.trim());
    } catch(e){ setErr("Error: "+String(e)); }
    setTesting(false);
  };

  return (
    <div style={{minHeight:"100vh",background:T.cream,display:"flex",flexDirection:"column",
      alignItems:"center",justifyContent:"center",padding:24,fontFamily:T.sans}}>
      <div style={{maxWidth:440,width:"100%"}}>
        <div style={{fontFamily:T.disp,fontSize:36,fontWeight:700,color:T.ink,letterSpacing:"-0.04em",marginBottom:4}}>MH</div>
        <div style={{fontSize:13,color:T.inkDim,marginBottom:28}}>Finanzas · Primera configuración</div>
        {[["1","Entrá a notion.so/my-integrations"],
          ["2","New integration → nombre MH Finanzas → Submit"],
          ["3","Copiá el Internal Integration Secret"],
          ["4","Abrí cada base en Notion → ··· → Connections → conectá MH Finanzas"],
        ].map(([n,txt])=>(
          <div key={n} style={{display:"flex",gap:12,marginBottom:12,alignItems:"flex-start"}}>
            <div style={{width:20,height:20,background:T.accent,color:T.cream,display:"flex",
              alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:11,fontWeight:700}}>{n}</div>
            <div style={{fontSize:12,color:T.inkMid,lineHeight:1.6}}>{txt}</div>
          </div>
        ))}
        <div style={{marginTop:20,display:"flex",flexDirection:"column",gap:12}}>
          <div>
            <label style={lblStyle}>Token Notion</label>
            <input style={inpStyle} placeholder="ntn_..." value={token}
              onChange={e=>setToken(e.target.value)} onKeyDown={e=>e.key==="Enter"&&test()}/>
          </div>
          <div>
            <label style={lblStyle}>API Key Anthropic <span style={{color:T.inkDim,fontWeight:400}}>(opcional — Asesor y Voz)</span></label>
            <input style={inpStyle} placeholder="sk-ant-api03-..." value={apiKey}
              onChange={e=>setApiKey(e.target.value)}/>
          </div>
          {err&&<div style={{padding:"8px 10px",background:T.negL,border:`1px solid ${T.neg}`,fontSize:11,color:T.neg,fontFamily:T.mono}}>{err}</div>}
          <button onClick={test} disabled={testing}
            style={{padding:11,background:T.ink,color:T.cream,border:"none",fontSize:12,
              fontWeight:600,letterSpacing:"0.04em",textTransform:"uppercase",opacity:testing?0.5:1}}>
            {testing?"Verificando…":"Conectar →"}
          </button>
        </div>
        <div style={{marginTop:16,fontSize:11,color:T.inkDim,lineHeight:1.6}}>
          El token queda guardado solo en este dispositivo.
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// MAIN APP
// ══════════════════════════════════════════════════════════════

// ── Pure UI components (module-level) ──────────────────────
const Lbl = ({children,size=9,color=T.inkDim,mb=0,mt=0})=>(
  <div style={{fontSize:size,fontFamily:T.sans,fontWeight:600,letterSpacing:"0.08em",textTransform:"uppercase",color,marginBottom:mb,marginTop:mt}}>{children}</div>
);
const Rule = ({my=0})=>(<div style={{borderTop:`1px solid ${T.rule}`,margin:`${my}px 0`}}/>);
const Chip = ({label,color=T.inkDim,bg=T.paper})=>(
  <span style={{fontSize:9,fontFamily:T.sans,fontWeight:600,letterSpacing:"0.05em",textTransform:"uppercase",padding:"2px 6px",background:bg,color,border:`1px solid ${T.rule}`,display:"inline-block"}}>{label}</span>
);
const Btn = ({onClick,children,primary,small,full,disabled,color,danger})=>{
  const bg=primary?(danger?T.neg:color||T.ink):T.cream;
  const cl=primary?T.cream:(danger?T.neg:color||T.ink);
  const bd=primary?(danger?T.neg:color||T.ink):(danger?T.neg:T.rule);
  return (<button onClick={onClick} disabled={disabled} style={{display:"inline-flex",alignItems:"center",justifyContent:"center",gap:6,padding:small?"5px 12px":"9px 20px",width:full?"100%":"auto",background:bg,color:cl,border:`1.5px solid ${bd}`,fontSize:11,fontFamily:T.sans,fontWeight:600,letterSpacing:"0.05em",textTransform:"uppercase",opacity:disabled?0.4:1}}>{children}</button>);
};
const EntryRow = ({e,showBucket=false})=>{
  const isPos=e.sub==="ingreso", isAdj=e.sub==="ajuste";
  return (
    <div className={e._pending?"pending":""} style={{display:"flex",alignItems:"flex-start",gap:12,padding:"11px 0",borderBottom:`1px solid ${T.ruleL}`}}>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:14,fontFamily:T.sans,fontWeight:500,color:T.ink,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginBottom:4}}>{e.desc}</div>
        <div style={{display:"flex",gap:5,flexWrap:"wrap",alignItems:"center"}}>
          {showBucket&&<Chip label={{personal:"PERS",compartido:"COMP",mh:"MH"}[e.bucket]||"—"} color={T.accent} bg={T.accentL}/>}
          {e.cat&&<Chip label={e.cat}/>}
          {isAdj&&<Chip label="AJUSTE" color={T.pos} bg={T.posL}/>}
          {isPos&&<Chip label="INGRESO" color={T.pos} bg={T.posL}/>}
          {e.pago&&<Chip label={e.pago}/>}
          {e._pending&&<Chip label="GUARDANDO…" color={T.accent} bg={T.accentL}/>}
          {e.fecha&&<span style={{fontSize:10,fontFamily:T.mono,color:T.inkDim}}>{e.fecha}</span>}
        </div>
      </div>
      <div style={{flexShrink:0,textAlign:"right"}}>
        <div className="num" style={{fontSize:15,fontWeight:500,color:isPos||isAdj?T.pos:T.ink}}>{isPos?"+":""}{ars(e.monto)}</div>
        {!e._pending&&e.notionId&&<a href={e.notionId} target="_blank" rel="noreferrer" style={{fontSize:9,color:T.inkDim,textDecoration:"none",fontFamily:T.mono,display:"block",marginTop:3}}>N ↗</a>}
      </div>
    </div>
  );
};
const ChartTip = ({active,payload,label})=>{
  if(!active||!payload?.length) return null;
  return (<div style={{background:T.cream,border:`1px solid ${T.rule}`,padding:"8px 12px"}}>
    <Lbl mb={6}>{label}</Lbl>
    {payload.map(p=>(<div key={p.name} style={{display:"flex",justifyContent:"space-between",gap:16,marginTop:3}}>
      <span style={{fontSize:10,color:T.inkMid,fontFamily:T.sans}}>{p.name}</span>
      <span className="num" style={{fontSize:11,color:T.ink}}>{ars(p.value)}</span>
    </div>))}
  </div>);
};


// ── Add Modal ─────────────────────────────────────────────
function AddModal({showAdd,setShowAdd,form,setForm,formErr,setFormErr,handleAdd,saving,listening,voiceText,voiceParsing,startVoice,err,colaboradores,proyectos}) {
if(!showAdd) return null;
  const isCuotas = form.metodo==="Crédito";
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(26,25,23,0.5)",display:"flex",alignItems:"flex-start",justifyContent:"center",zIndex:200,paddingTop:40,overflowY:"auto"}}>
      <div className="fade" style={{background:T.cream,width:"100%",maxWidth:500,borderTop:`3px solid ${T.accent}`,margin:"0 16px 40px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"16px 20px",borderBottom:`1px solid ${T.rule}`}}>
          <div style={{fontFamily:T.disp,fontSize:17,fontWeight:700,color:T.ink}}>Nuevo movimiento</div>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <button onClick={startVoice} style={{width:32,height:32,background:listening?T.accent:T.paper,color:listening?T.cream:T.inkMid,border:`1px solid ${listening?T.accent:T.rule}`,borderRadius:"50%",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center"}}>🎙</button>
            <button onClick={()=>setShowAdd(false)} style={{background:"none",border:"none",fontSize:20,color:T.inkDim,lineHeight:1}}>×</button>
          </div>
        </div>
        {(listening||voiceParsing||voiceText)&&(
          <div style={{padding:"10px 20px",background:T.accentL,borderBottom:`1px solid ${T.rule}`,display:"flex",alignItems:"center",gap:8}}>
            {listening&&<><div style={{width:8,height:8,borderRadius:"50%",background:T.accent}} className="spin"/><span style={{fontSize:12,color:T.accent,fontFamily:T.sans}}>Escuchando…</span></>}
            {voiceParsing&&<><div style={{width:14,height:14,border:`1.5px solid ${T.rule}`,borderTopColor:T.accent,borderRadius:"50%"}} className="spin"/><span style={{fontSize:12,color:T.inkMid,fontFamily:T.sans}}>Procesando: "{voiceText}"</span></>}
            {voiceText&&!listening&&!voiceParsing&&<span style={{fontSize:11,color:T.inkMid,fontFamily:T.mono}}>✓ "{voiceText}"</span>}
          </div>
        )}
        <div style={{padding:20,display:"flex",flexDirection:"column",gap:14}}>
          {/* Bucket */}
          <div style={{display:"flex",border:`1.5px solid ${T.rule}`}}>
            {[["personal","Personal"],["compartido","Compartido"],["mh","MeinHaus"]].map(([k,l],i)=>(
              <button key={k} onClick={()=>setForm(f=>({...f,bucket:k,cat:CATS[k][0]}))} style={{flex:1,padding:"8px 4px",border:"none",borderRight:i<2?`1px solid ${T.rule}`:"none",background:form.bucket===k?T.ink:T.cream,color:form.bucket===k?T.cream:T.inkMid,fontSize:11,fontFamily:T.sans,fontWeight:600,letterSpacing:"0.04em"}}>{l}</button>
            ))}
          </div>
          <div>
            <label style={lblStyle}>Descripción</label>
            <input style={{...inpStyle,outline:formErr&&!form.desc.trim()?`2px solid ${T.neg}`:"none"}} placeholder="ej: Materiales ferretería" autoFocus value={form.desc} onChange={e=>setForm(f=>({...f,desc:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&handleAdd()}/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <div>
              <label style={lblStyle}>Monto total</label>
              <input style={{...inpStyle,fontFamily:T.mono,outline:formErr&&!(parseFloat(form.monto)>0)?`2px solid ${T.neg}`:"none"}} type="number" placeholder="0" value={form.monto} onChange={e=>setForm(f=>({...f,monto:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&handleAdd()}/>
            </div>
            <div>
              <label style={lblStyle}>Fecha</label>
              <input style={{...inpStyle,fontFamily:T.mono,fontSize:12}} type="date" value={form.fecha} onChange={e=>setForm(f=>({...f,fecha:e.target.value}))}/>
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            {form.bucket==="compartido"&&<div><label style={lblStyle}>Pagó</label><select style={selStyle} value={form.pago} onChange={e=>setForm(f=>({...f,pago:e.target.value}))}><option>Mariano</option><option>Flor</option></select></div>}
            {form.bucket==="personal"&&<div><label style={lblStyle}>Método</label><select style={selStyle} value={form.metodo} onChange={e=>setForm(f=>({...f,metodo:e.target.value}))}>{METODOS.map(m=><option key={m}>{m}</option>)}</select></div>}
            {form.bucket==="mh"&&<div><label style={lblStyle}>Tipo</label><select style={selStyle} value={form.mhTipo} onChange={e=>setForm(f=>({...f,mhTipo:e.target.value}))}><option>Egreso</option><option>Ingreso</option></select></div>}
            <div><label style={lblStyle}>Categoría</label><select style={{...selStyle,fontSize:12}} value={form.cat} onChange={e=>setForm(f=>({...f,cat:e.target.value}))}>{CATS[form.bucket].map(c=><option key={c}>{c}</option>)}</select></div>
          </div>
          {/* Cuotas — solo para Crédito en personal */}
          {form.bucket==="personal"&&form.metodo==="Crédito"&&(
            <div style={{padding:"12px",background:T.paper,border:`1px solid ${T.rule}`}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                <div>
                  <label style={lblStyle}>Cuotas</label>
                  <select style={selStyle} value={form.cuotasN} onChange={e=>setForm(f=>({...f,cuotasN:Number(e.target.value)}))}>
                    {CUOTAS_OPT.map(n=><option key={n} value={n}>{n===1?"Sin cuotas":n+" cuotas"}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lblStyle}>Tarjeta</label>
                  <select style={selStyle} value={form.tarjeta} onChange={e=>setForm(f=>({...f,tarjeta:e.target.value}))}>
                    <option>BBVA Personal</option><option>Patagonia SAS</option>
                  </select>
                </div>
              </div>
              {form.cuotasN>1&&(
                <div style={{marginTop:8,fontSize:11,color:T.accent,fontFamily:T.mono}}>
                  {form.cuotasN} × {ars(Math.round(parseFloat(form.monto||0)/form.cuotasN))}/mes · Se generan {form.cuotasN} débitos futuros
                </div>
              )}
            </div>
          )}
          {formErr&&<div style={{padding:"7px 10px",background:T.negL,border:`1px solid ${T.neg}`,fontSize:11,color:T.neg,fontFamily:T.sans}}>{formErr}</div>}
          <div style={{display:"flex",gap:10,marginTop:4}}>
            <Btn onClick={()=>setShowAdd(false)}>Cancelar</Btn>
            <Btn primary full onClick={handleAdd} disabled={saving}>{saving?"Guardando…":"Guardar →"}</Btn>
          </div>
          <div style={{fontSize:9,color:T.inkDim,letterSpacing:"0.06em",textTransform:"uppercase",textAlign:"center"}}>Persiste en Notion · {form.bucket.toUpperCase()}</div>
        </div>
      </div>
    </div>
  );
};



// ── Stable form styles (module-level) ────────────────────────
const inpStyle = {width:"100%",padding:"9px 10px",border:`1.5px solid ${T.rule}`,fontSize:14,color:T.ink,background:T.cream};
const selStyle = {width:"100%",padding:"9px 10px",border:`1.5px solid ${T.rule}`,fontSize:14,color:T.ink,background:T.cream};
const lblStyle = {fontSize:9,fontFamily:T.sans,fontWeight:600,letterSpacing:"0.08em",textTransform:"uppercase",color:T.inkDim,display:"block",marginBottom:5};

export default function App() {
  const [notionToken, setNotionToken] = useState(getStoredToken);
  const [nav,         setNav]         = useState("home");
  const [entries,     setEntries]     = useState({compartido:[],mh:[],personal:[]});
  const [cuotas,      setCuotas]      = useState([]);
  const [colaboradores, setColaboradores] = useState([]);
  const [honorarios,  setHonorarios]  = useState([]);
  const [pagosColab,  setPagosColab]  = useState([]);
  const [proyectos,   setProyectos]   = useState([]);
  const [cfg,         setCfg]         = useState({ingresoMensual:0,metaAhorro:20,cierreBBVA:""});
  const [loading,     setLoading]     = useState(false);
  const [syncing,     setSyncing]     = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [err,         setErr]         = useState(null);
  const [showAdd,     setShowAdd]     = useState(false);
  const [settle,      setSettle]      = useState(false);
  const [advice,      setAdvice]      = useState("");
  const [advLoad,     setAdvLoad]     = useState(false);
  const [movFilter,   setMovFilter]   = useState("all");
  const [movSearch,   setMovSearch]   = useState("");
  const [lastSync,    setLastSync]    = useState(null);
  const [formErr,     setFormErr]     = useState("");
  const [listening,   setListening]   = useState(false);
  const [voiceText,   setVoiceText]   = useState("");
  const [voiceParsing,setVoiceParsing]= useState(false);
  const [colabScreen, setColabScreen] = useState("list"); // list | detail | newColab | newHonorario | newPago
  const [selectedColab, setSelectedColab] = useState(null);
  const [form, setForm] = useState({
    desc:"",monto:"",bucket:"personal",pago:"Mariano",cat:"Comida",
    fecha:today(),metodo:"Débito",mhTipo:"Egreso",
    cuotasN:1,tarjeta:"BBVA Personal",
    // colab form
    colabNombre:"",colabEspecialidad:"Construcción",colabContacto:"",
    honColaborador:"",honProyecto:"",honMonto:"",honFechaInicio:today(),honNotas:"",
    pagoColaborador:"",pagoProyecto:"",pagoMonto:"",pagoFecha:today(),
    pagoTipo:"Adelanto",pagoMetodo:"Transferencia",pagoNotas:"",
  });

  // Config
  useEffect(()=>{
    try{ const r=localStorage.getItem(CFG_KEY); if(r) setCfg(JSON.parse(r)); }catch{}
  },[]);
  const saveCfg = c => { setCfg(c); try{localStorage.setItem(CFG_KEY,JSON.stringify(c));}catch{} };

  // ── Load data ─────────────────────────────────────────────
  const loadAll = useCallback(async(silent=false)=>{
    const tok = getStoredToken();
    if(!tok) return;
    setSyncing(true); setErr(null);
    const norm = (arr,bucket,subFn) => Array.isArray(arr)
      ? arr.map(e=>({...e,bucket,sub:subFn(e),monto:Number(e.monto)||0,_pending:false})) : [];

    try { const r=await queryDB(DB_IDS.personal,"personal",tok);
      if(!r?.error) setEntries(e=>({...e,personal:norm(r,"personal",()=>"gasto")})); } catch {}
    try { const r=await queryDB(DB_IDS.compartido,"compartido",tok);
      if(!r?.error) setEntries(e=>({...e,compartido:norm(r,"compartido",x=>x.estado==="Saldado"?"ajuste":"gasto")})); } catch {}
    try { const r=await queryDB(DB_IDS.mh,"mh",tok);
      if(!r?.error) setEntries(e=>({...e,mh:norm(r,"mh",x=>(x.tipo||"").toLowerCase()==="ingreso"?"ingreso":"egreso")})); } catch {}
    try { const r=await queryDB(DB_IDS.cuotas,"cuota",tok);
      if(!r?.error&&Array.isArray(r)) setCuotas(r.map(c=>({...c,montoCuota:Number(c.montoCuota)||0}))); } catch {}
    try { const r=await queryDB(DB_IDS.colaboradores,"colaborador",tok);
      if(!r?.error&&Array.isArray(r)) setColaboradores(r); } catch {}
    try { const r=await queryDB(DB_IDS.honorarios,"honorario",tok);
      if(!r?.error&&Array.isArray(r)) setHonorarios(r.map(h=>({...h,montoPactado:Number(h.montoPactado)||0,totalAdelantado:Number(h.totalAdelantado)||0}))); } catch {}
    try { const r=await queryDB(DB_IDS.pagosColab,"pagoColab",tok);
      if(!r?.error&&Array.isArray(r)) setPagosColab(r.map(p=>({...p,monto:Number(p.monto)||0}))); } catch {}
    try { const r=await queryDB(DB_IDS.proyectos,"proyecto",tok);
      if(!r?.error&&Array.isArray(r)) setProyectos(r); } catch {}

    setLastSync(new Date());
    setSyncing(false);
  },[]);

  useEffect(()=>{ if(notionToken) loadAll(); },[loadAll,notionToken]);

  // ── Voice ─────────────────────────────────────────────────
  const startVoice = useCallback(()=>{
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!SR){ setErr("Tu navegador no soporta voz."); return; }
    const rec=new SR(); rec.lang="es-AR"; rec.continuous=false; rec.interimResults=false;
    rec.onstart=()=>{setListening(true);setVoiceText("");};
    rec.onresult=async e=>{
      const t=e.results[0][0].transcript; setVoiceText(t); setListening(false); setVoiceParsing(true);
      const p=await parseVoiceInput(t); setVoiceParsing(false);
      if(p){ setForm(f=>({...f,desc:p.desc||f.desc,monto:p.monto||f.monto,bucket:p.bucket||f.bucket,cat:p.cat||f.cat})); if(!showAdd) setShowAdd(true); }
      else setErr("No pude parsear. Intentá de nuevo.");
    };
    rec.onerror=()=>{setListening(false);};
    rec.onend=()=>setListening(false);
    rec.start();
  },[showAdd]);

  // ── Add gasto (with cuotas) ───────────────────────────────
  const handleAdd = async()=>{
    const monto=parseFloat(form.monto);
    if(!form.desc.trim()){ setFormErr("Escribí una descripción"); return; }
    if(isNaN(monto)||monto<=0){ setFormErr("El monto tiene que ser mayor a 0"); return; }
    setFormErr(""); setSaving(true);
    const tok=getStoredToken();
    const isCuotas = form.metodo==="Crédito" && form.cuotasN > 1;

    if(isCuotas) {
      // Generate N installments
      const grupoId = "G"+Date.now();
      const montoCuota = Math.round(monto/form.cuotasN);
      const tempEntries = [];
      for(let i=1;i<=form.cuotasN;i++){
        const mesDebito = addMonths(form.fecha, i-1);
        const tempId = "pending_cuota_"+i+"_"+Date.now();
        const opt = {
          notionId:tempId, _pending:true, estado:"Pendiente",
          desc:`${form.desc} (${i}/${form.cuotasN})`,
          montoCuota, cuotaN:i, totalCuotas:form.cuotasN,
          tarjeta:form.tarjeta, fechaCompra:form.fecha, mesDebito,
          grupoId, descOriginal:form.desc,
        };
        tempEntries.push(opt);
        setCuotas(c=>[...c,opt]);
        // Create in Notion (sequential to avoid rate limit)
        const props = notionProps("cuota",{...opt,montoCuota,cuotaN:i,totalCuotas:form.cuotasN,
          fechaCompra:form.fecha,mesDebito,grupoId,descOriginal:form.desc});
        const res = await createPage(DB_IDS.cuotas, props, tok);
        if(res?.success) setCuotas(c=>c.map(x=>x.notionId===tempId?{...x,notionId:res.notionId,_pending:false}:x));
      }
    } else {
      // Normal single gasto
      const tempId="pending_"+Date.now();
      const base={notionId:tempId,desc:form.desc,monto,cat:form.cat,fecha:form.fecha,_pending:true};
      let optimistic;
      if(form.bucket==="personal")       optimistic={...base,metodo:form.metodo,bucket:"personal",sub:"gasto"};
      else if(form.bucket==="compartido") optimistic={...base,pago:form.pago,estado:"Pendiente",bucket:"compartido",sub:"gasto"};
      else optimistic={...base,tipo:form.mhTipo,bucket:"mh",sub:form.mhTipo==="Ingreso"?"ingreso":"egreso"};
      setEntries(e=>({...e,[form.bucket]:[optimistic,...e[form.bucket]]}));
      const props=notionProps(form.bucket,{desc:form.desc,monto,pago:form.pago,cat:form.cat,fecha:form.fecha,metodo:form.metodo,mhTipo:form.mhTipo});
      const res=await createPage(DB_IDS[form.bucket],props,tok);
      if(res?.success) setEntries(e=>({...e,[form.bucket]:e[form.bucket].map(x=>x.notionId===tempId?{...x,notionId:res.notionId,_pending:false}:x)}));
      else { setErr(res?.error||"Error al guardar"); setEntries(e=>({...e,[form.bucket]:e[form.bucket].filter(x=>x.notionId!==tempId)})); }
    }
    setForm(f=>({...f,desc:"",monto:""}));
    setShowAdd(false);
    setSaving(false);
  };

  // ── Settle compartido ─────────────────────────────────────
  const handleSettle = async(st)=>{
    if(st.balOut<=0) return;
    setSaving(true);
    const tok=getStoredToken();
    const desc=`Saldo · ${st.balDeb} → ${st.balCred}`;
    const props=notionProps("compartido",{desc,monto:st.balOut,pago:st.balDeb,cat:"Otros",fecha:today(),estado:"Saldado"});
    const res=await createPage(DB_IDS.compartido,props,tok);
    if(res?.success) setEntries(e=>({...e,compartido:[{notionId:res.notionId,desc,monto:st.balOut,pago:st.balDeb,cat:"Otros",fecha:today(),bucket:"compartido",sub:"ajuste",estado:"Saldado"},...e.compartido]}));
    else setErr(res?.error||"Error");
    setSettle(false); setSaving(false);
  };

  // ── Mark cuota as paid ────────────────────────────────────
  const marcarCuotaPagada = async(cuota)=>{
    const tok=getStoredToken();
    setCuotas(c=>c.map(x=>x.notionId===cuota.notionId?{...x,estado:"Debitado"}:x));
    if(cuota.notionId&&!cuota.notionId.startsWith("pending_")){
      await updatePage(cuota.notionId,{"Estado":{select:{name:"Debitado"}}},tok);
    }
  };

  // ── New honorario ─────────────────────────────────────────
  const handleNewHonorario = async()=>{
    if(!form.honColaborador||!form.honProyecto||!form.honMonto){ setFormErr("Completá todos los campos"); return; }
    setSaving(true); setFormErr("");
    const tok=getStoredToken();
    const data={colaborador:form.honColaborador,proyecto:form.honProyecto,montoPactado:parseFloat(form.honMonto),fechaInicio:form.honFechaInicio,notas:form.honNotas};
    const tempId="pending_hon_"+Date.now();
    setHonorarios(h=>[...h,{notionId:tempId,_pending:true,...data,totalAdelantado:0,estado:"En curso"}]);
    const res=await createPage(DB_IDS.honorarios,notionProps("honorario",data),tok);
    if(res?.success) setHonorarios(h=>h.map(x=>x.notionId===tempId?{...x,notionId:res.notionId,_pending:false}:x));
    setForm(f=>({...f,honColaborador:"",honProyecto:"",honMonto:"",honNotas:""}));
    setColabScreen("list"); setSaving(false);
  };

  // ── New pago colaborador ──────────────────────────────────
  const handleNewPagoColab = async()=>{
    const monto=parseFloat(form.pagoMonto);
    if(!form.pagoColaborador||isNaN(monto)||monto<=0){ setFormErr("Completá colaborador y monto"); return; }
    setSaving(true); setFormErr("");
    const tok=getStoredToken();
    const data={colaborador:form.pagoColaborador,proyecto:form.pagoProyecto,monto,fecha:form.pagoFecha,tipo:form.pagoTipo,metodo:form.pagoMetodo,notas:form.pagoNotas};
    const tempId="pending_pago_"+Date.now();
    setPagosColab(p=>[...p,{notionId:tempId,_pending:true,...data}]);
    // Update totalAdelantado in honorario
    if(form.pagoTipo==="Adelanto"||form.pagoTipo==="Pago final"){
      const hon=honorarios.find(h=>h.colaborador===form.pagoColaborador&&h.proyecto===form.pagoProyecto);
      if(hon&&hon.notionId&&!hon.notionId.startsWith("pending_")){
        const newTotal=(hon.totalAdelantado||0)+monto;
        setHonorarios(h=>h.map(x=>x.notionId===hon.notionId?{...x,totalAdelantado:newTotal}:x));
        await updatePage(hon.notionId,{"Total adelantado":{number:newTotal}},tok);
      }
    }
    const res=await createPage(DB_IDS.pagosColab,notionProps("pagoColab",data),tok);
    if(res?.success) setPagosColab(p=>p.map(x=>x.notionId===tempId?{...x,notionId:res.notionId,_pending:false}:x));
    setForm(f=>({...f,pagoMonto:"",pagoNotas:"",pagoColaborador:"",pagoProyecto:""}));
    setColabScreen("list"); setSaving(false);
  };

  // ── New colaborador ───────────────────────────────────────
  const handleNewColab = async()=>{
    if(!form.colabNombre){ setFormErr("Escribí el nombre"); return; }
    setSaving(true); setFormErr("");
    const tok=getStoredToken();
    const data={nombre:form.colabNombre,especialidad:form.colabEspecialidad,contacto:form.colabContacto};
    const tempId="pending_colab_"+Date.now();
    setColaboradores(c=>[...c,{notionId:tempId,_pending:true,...data,estado:"Activo"}]);
    const res=await createPage(DB_IDS.colaboradores,notionProps("colaborador",data),tok);
    if(res?.success) setColaboradores(c=>c.map(x=>x.notionId===tempId?{...x,notionId:res.notionId,_pending:false}:x));
    setForm(f=>({...f,colabNombre:"",colabContacto:""}));
    setColabScreen("list"); setSaving(false);
  };

  // ── AI advice ─────────────────────────────────────────────
  const getAdvice = async(st)=>{
    setAdvLoad(true); setAdvice("");
    const totalDeuda=honorarios.reduce((s,h)=>s+Math.max(0,(h.montoPactado||0)-(h.totalAdelantado||0)),0);
    const prompt=`Datos financieros de Mariano (${new Date().toLocaleDateString("es-AR",{month:"long",year:"numeric"})}):\nPERSONAL — Egresos: ${ars(st.persEgr)}\nMEINHAUS — Ingresos: ${ars(st.mhIng)}, Egresos: ${ars(st.mhEgr)}, Neto: ${signStr(st.mhNeto)}\nCOMPARTIDO — Balance: ${st.balOut>0?`${st.balDeb} debe ${ars(st.balOut)} a ${st.balCred}`:"al día"}\nCUOTAS PENDIENTES — ${st.cuotasPend.length} cuotas, total: ${ars(st.cuotasTotal)}\nHONORARIOS ADEUDADOS A COLABORADORES — ${ars(totalDeuda)}\nAnalizá y dame recomendaciones concretas.`;
    setAdvice(await claudeCall("Sos el asesor financiero de Mariano Serdoch, director de MeinHaus (Argentina). Directo, voseo, máximo 5 puntos accionables.",[{role:"user",content:prompt}]));
    setAdvLoad(false);
  };

  // ── Derived ───────────────────────────────────────────────
  const all    = useMemo(()=>[...entries.personal,...entries.compartido,...entries.mh],[entries]);
  const sorted = useMemo(()=>[...all].sort((a,b)=>(b.fecha||"").localeCompare(a.fecha||"")),[all]);
  const stats  = useMemo(()=>buildStats(all,cuotas),[all,cuotas]);
  const movList = useMemo(()=>{
    let list=movFilter==="all"?sorted:sorted.filter(e=>e.bucket===movFilter);
    if(movSearch.trim()){ const q=movSearch.toLowerCase(); list=list.filter(e=>e.desc?.toLowerCase().includes(q)||e.cat?.toLowerCase().includes(q)||e.fecha?.includes(q)); }
    return list;
  },[sorted,movFilter,movSearch]);

  const thisM=today().slice(0,7), prevM=prevMonth();
  const monthCompare = useMemo(()=>{
    const t=all.filter(e=>monthOf(e)===thisM&&(e.sub==="gasto"||e.sub==="egreso")).reduce((s,e)=>s+e.monto,0);
    const p=all.filter(e=>monthOf(e)===prevM&&(e.sub==="gasto"||e.sub==="egreso")).reduce((s,e)=>s+e.monto,0);
    return {thisTotal:t,prevTotal:p,diff:t-p,diffPct:p>0?Math.round(((t-p)/p)*100):null};
  },[all,thisM,prevM]);

  // Cuotas del próximo cierre
  const cuotasProxCierre = useMemo(()=>{
    if(!cfg.cierreBBVA) return [];
    return cuotas.filter(c=>c.estado==="Pendiente"&&c.mesDebito&&c.mesDebito<=cfg.cierreBBVA);
  },[cuotas,cfg.cierreBBVA]);

  // Deuda por colaborador
  const deudaColab = useMemo(()=>{
    const map={};
    honorarios.forEach(h=>{
      const saldo=Math.max(0,(h.montoPactado||0)-(h.totalAdelantado||0));
      if(!map[h.colaborador]) map[h.colaborador]={nombre:h.colaborador,saldo:0,proyectos:[]};
      map[h.colaborador].saldo+=saldo;
      if(saldo>0) map[h.colaborador].proyectos.push(h.proyecto);
    });
    return Object.values(map).sort((a,b)=>b.saldo-a.saldo);
  },[honorarios]);

  // ── Shell ─────────────────────────────────────────────────
  const SIDEBAR_W=180;
  const NAV_ITEMS=[["home","Inicio"],["movimientos","Movimientos"],["tarjeta","Tarjeta"],["equipo","Equipo"],["analisis","Análisis"],["consejero","Asesor"]];

  const NavSidebar=()=>(
    <div style={{width:SIDEBAR_W,flexShrink:0,borderRight:`1.5px solid ${T.rule}`,display:"flex",flexDirection:"column",padding:"28px 0"}}>
      <div style={{padding:"0 24px 28px"}}>
        <div style={{fontFamily:T.disp,fontSize:22,fontWeight:700,color:T.ink,letterSpacing:"-0.03em"}}>MH</div>
        <div style={{fontSize:10,color:T.inkDim,marginTop:2,letterSpacing:"0.06em"}}>FINANZAS</div>
      </div>
      <Rule/>
      <div style={{paddingTop:20}}>
        {NAV_ITEMS.map(([k,l])=>(<button key={k} onClick={()=>setNav(k)} style={{display:"block",width:"100%",textAlign:"left",padding:"10px 24px",background:nav===k?T.accentL:"transparent",border:"none",borderLeft:`2.5px solid ${nav===k?T.accent:"transparent"}`,fontSize:12,fontFamily:T.sans,fontWeight:nav===k?600:400,color:nav===k?T.accent:T.inkMid}}>{l}</button>))}
      </div>
      <div style={{marginTop:"auto",padding:"20px 24px 0",display:"flex",flexDirection:"column",gap:8}}>
        {syncing&&<div style={{display:"flex",alignItems:"center",gap:6}}><div style={{width:10,height:10,border:`1.5px solid ${T.rule}`,borderTopColor:T.accent,borderRadius:"50%"}} className="spin"/><span style={{fontSize:9,color:T.inkDim,fontFamily:T.sans,letterSpacing:"0.06em",textTransform:"uppercase"}}>Sync…</span></div>}
        {lastSync&&!syncing&&<div style={{fontSize:9,color:T.inkDim,fontFamily:T.mono}}>↻ {lastSync.toLocaleTimeString("es-AR",{hour:"2-digit",minute:"2-digit"})}</div>}
        <button onClick={()=>loadAll(true)} disabled={syncing} style={{background:"none",border:"none",fontSize:9,color:T.inkDim,fontFamily:T.sans,letterSpacing:"0.06em",textTransform:"uppercase",padding:0,textAlign:"left"}}>Recargar</button>
      </div>
    </div>
  );

  const NavBottom=()=>(
    <div style={{position:"fixed",bottom:0,left:0,right:0,background:T.cream,borderTop:`1.5px solid ${T.rule}`,display:"flex",zIndex:99,overflowX:"auto"}}>
      {NAV_ITEMS.map(([k,l])=>(<button key={k} onClick={()=>setNav(k)} style={{flex:"0 0 auto",padding:"11px 10px 9px",background:"none",border:"none",borderTop:`2px solid ${nav===k?T.accent:"transparent"}`,fontSize:9,fontFamily:T.sans,fontWeight:600,letterSpacing:"0.05em",color:nav===k?T.accent:T.inkDim,textTransform:"uppercase",whiteSpace:"nowrap"}}>{l}</button>))}
    </div>
  );

  const Shell=({children})=>{
    const [wide,setWide]=useState(window.innerWidth>=720);
    useEffect(()=>{const h=()=>setWide(window.innerWidth>=720);window.addEventListener("resize",h);return()=>window.removeEventListener("resize",h);},[]);
    return (<>
      <style>{CSS}</style>
      <div style={{minHeight:"100vh",background:T.cream,display:"flex",flexDirection:wide?"row":"column"}}>
        {wide&&<NavSidebar/>}
        <div style={{flex:1,minWidth:0,overflowY:"auto",paddingBottom:wide?0:58}}>
          {children}
          <button onClick={startVoice} title="Cargar por voz"
            style={{position:"fixed",bottom:wide?80:120,right:24,width:40,height:40,
              background:listening?T.accent:T.paper,color:listening?T.cream:T.inkMid,
              border:`1.5px solid ${listening?T.accent:T.rule}`,borderRadius:"50%",fontSize:16,
              display:"flex",alignItems:"center",justifyContent:"center",
              boxShadow:"0 2px 8px rgba(0,0,0,0.12)",
              animation:listening?"voicePulse 0.8s ease-in-out infinite":undefined}}>🎙</button>
          <button onClick={()=>setShowAdd(true)} title="Nuevo movimiento"
            style={{position:"fixed",bottom:wide?28:68,right:24,width:44,height:44,
              background:T.accent,color:T.cream,border:"none",fontSize:24,fontWeight:300,
              display:"flex",alignItems:"center",justifyContent:"center",
              boxShadow:"0 3px 14px rgba(184,92,42,0.35)"}}>+</button>
        </div>
        {!wide&&<NavBottom/>}
      </div>
    </>);
  };

  const ErrBanner=()=>err?(<div style={{margin:"0 20px 12px",padding:"9px 12px",background:T.negL,border:`1px solid ${T.neg}`,fontSize:11,color:T.neg,fontFamily:T.mono}}>{err}</div>):null;

  const inpS={width:"100%",padding:"9px 10px",border:`1.5px solid ${T.rule}`,fontSize:14,color:T.ink,background:T.cream};
  const selS={...inpS};
  // ── Gate ──────────────────────────────────────────────────
  if(!notionToken) return (<><style>{CSS}</style><SetupScreen onToken={t=>{try{localStorage.setItem(NOTION_TOKEN_KEY,t);}catch{}setNotionToken(t);}}/></>);

  // ── HOME ──────────────────────────────────────────────────
  if(nav==="home") {
    const ahorroR=cfg.ingresoMensual>0?pct(Math.max(0,cfg.ingresoMensual-stats.persEgr),cfg.ingresoMensual):null;
    const diasCierre=daysUntil(cfg.cierreBBVA);
    const totalDeudaColab=deudaColab.reduce((s,c)=>s+c.saldo,0);
    return (<Shell><AddModal showAdd={showAdd} setShowAdd={setShowAdd} form={form} setForm={setForm} formErr={formErr} setFormErr={setFormErr} handleAdd={handleAdd} saving={saving} listening={listening} voiceText={voiceText} voiceParsing={voiceParsing} startVoice={startVoice} err={err} colaboradores={colaboradores} proyectos={proyectos}/>
      <div style={{padding:"24px 28px 16px",borderBottom:`1px solid ${T.rule}`}}>
        <div style={{fontSize:10,color:T.inkDim,fontFamily:T.sans,fontWeight:600,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:8}}>{new Date().toLocaleDateString("es-AR",{weekday:"long",day:"numeric",month:"long"}).replace(/^\w/,c=>c.toUpperCase())}</div>
        <div style={{fontFamily:T.disp,fontSize:26,fontWeight:700,color:T.ink,letterSpacing:"-0.02em"}}>Finanzas MeinHaus</div>
      </div>

      {/* Cierre BBVA alert */}
      {cfg.cierreBBVA&&diasCierre!==null&&diasCierre<=7&&(
        <div style={{padding:"12px 28px",background:T.warnL,borderBottom:`1px solid ${T.rule}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <Lbl color={T.warn} mb={4}>⚠ Cierre BBVA en {diasCierre} día{diasCierre!==1?"s":""}</Lbl>
            <div className="num" style={{fontSize:18,color:T.warn}}>{ars(cuotasProxCierre.reduce((s,c)=>s+c.montoCuota,0))}</div>
          </div>
          <Btn small onClick={()=>setNav("tarjeta")} color={T.warn}>Ver tarjeta</Btn>
        </div>
      )}

      {/* KPIs */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",borderBottom:`1px solid ${T.rule}`}}>
        {[["Personal",ars(stats.persEgr),T.ink],["MeinHaus",signStr(stats.mhNeto),stats.mhNeto>=0?T.pos:T.neg],["Compartido",ars(stats.tot),T.ink]].map(([l,v,c],i)=>(
          <div key={l} style={{padding:"16px 14px",borderRight:i<2?`1px solid ${T.rule}`:"none"}}>
            <Lbl mb={6}>{l}</Lbl>
            <div className="num" style={{fontSize:17,fontWeight:500,color:c,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{v}</div>
          </div>
        ))}
      </div>

      {/* Cuotas + Deuda colab summary */}
      {(stats.cuotasPend.length>0||totalDeudaColab>0)&&(
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",borderBottom:`1px solid ${T.rule}`}}>
          {stats.cuotasPend.length>0&&<div style={{padding:"14px",borderRight:`1px solid ${T.rule}`,cursor:"pointer"}} onClick={()=>setNav("tarjeta")}>
            <Lbl color={T.accent} mb={5}>Cuotas pendientes</Lbl>
            <div className="num" style={{fontSize:18,color:T.accent}}>{ars(stats.cuotasTotal)}</div>
            <div style={{fontSize:10,color:T.inkDim,marginTop:3}}>{stats.cuotasPend.length} cuotas</div>
          </div>}
          {totalDeudaColab>0&&<div style={{padding:"14px",cursor:"pointer"}} onClick={()=>setNav("equipo")}>
            <Lbl color={T.neg} mb={5}>Deuda colaboradores</Lbl>
            <div className="num" style={{fontSize:18,color:T.neg}}>{ars(totalDeudaColab)}</div>
            <div style={{fontSize:10,color:T.inkDim,marginTop:3}}>{deudaColab.filter(c=>c.saldo>0).length} personas</div>
          </div>}
        </div>
      )}

      {/* Balance compartido */}
      {stats.balOut>0&&<div style={{padding:"14px 28px",background:T.accentL,borderBottom:`1px solid ${T.rule}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        {!settle?(<>
          <div><Lbl color={T.accent} mb={5}>Balance pendiente</Lbl><div style={{display:"flex",alignItems:"baseline",gap:8}}><span className="num" style={{fontSize:20,color:T.accent,fontWeight:500}}>{ars(stats.balOut)}</span><span style={{fontSize:11,color:T.inkMid}}>{stats.balDeb} → {stats.balCred}</span></div></div>
          <Btn small onClick={()=>setSettle(true)}>Saldar</Btn>
        </>):(<div style={{width:"100%"}}>
          <Lbl color={T.accent} mb={8}>{stats.balDeb} transfiere {ars(stats.balOut)} a {stats.balCred}</Lbl>
          <div style={{display:"flex",gap:8}}><Btn small onClick={()=>setSettle(false)}>Cancelar</Btn><Btn small primary onClick={()=>handleSettle(stats)} disabled={saving}>{saving?"…":"Confirmar →"}</Btn></div>
        </div>)}
      </div>}

      {/* Ahorro rate */}
      {ahorroR!==null&&<div style={{padding:"14px 28px",borderBottom:`1px solid ${T.rule}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div><Lbl mb={5}>Tasa de ahorro</Lbl><div style={{display:"flex",alignItems:"baseline",gap:8}}><span className="num" style={{fontSize:22,fontWeight:500,color:ahorroR>=cfg.metaAhorro?T.pos:T.neg}}>{ahorroR}%</span><span style={{fontSize:11,color:T.inkDim}}>meta {cfg.metaAhorro}%</span></div></div>
        <div style={{width:80,height:4,background:T.rule,position:"relative",flexShrink:0}}>
          <div style={{position:"absolute",left:0,top:0,bottom:0,width:`${Math.min(100,ahorroR)}%`,background:ahorroR>=cfg.metaAhorro?T.pos:T.accent,transition:"width 0.6s"}}/>
          <div style={{position:"absolute",left:`${Math.min(100,cfg.metaAhorro)}%`,top:-4,bottom:-4,width:1.5,background:T.inkDim}}/>
        </div>
      </div>}

      {/* Month compare */}
      {(monthCompare.thisTotal>0||monthCompare.prevTotal>0)&&<div style={{padding:"14px 28px",borderBottom:`1px solid ${T.rule}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div><Lbl mb={8}>Este mes vs anterior</Lbl>
          <div style={{display:"flex",gap:20,alignItems:"baseline"}}>
            <div><div style={{fontSize:9,color:T.inkDim,fontFamily:T.mono,marginBottom:2}}>{MESES[new Date().getMonth()]}</div><div className="num" style={{fontSize:18,fontWeight:500,color:T.ink}}>{ars(monthCompare.thisTotal)}</div></div>
            {monthCompare.prevTotal>0&&<><div style={{color:T.rule,fontSize:14}}>→</div><div><div style={{fontSize:9,color:T.inkDim,fontFamily:T.mono,marginBottom:2}}>{MESES[new Date(prevM+"-01").getMonth()]}</div><div className="num" style={{fontSize:14,color:T.inkMid}}>{ars(monthCompare.prevTotal)}</div></div></>}
          </div>
        </div>
        {monthCompare.diffPct!==null&&<div style={{padding:"8px 12px",background:monthCompare.diff>0?T.negL:T.posL,border:`1px solid ${monthCompare.diff>0?T.neg:T.pos}`}}>
          <div className="num" style={{fontSize:18,fontWeight:600,color:monthCompare.diff>0?T.neg:T.pos}}>{monthCompare.diff>0?"+":""}{monthCompare.diffPct}%</div>
        </div>}
      </div>}

      <ErrBanner/>
      <div style={{padding:"20px 28px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}><Lbl>Últimos movimientos</Lbl><button onClick={()=>setNav("movimientos")} style={{background:"none",border:"none",fontSize:10,color:T.accent,fontFamily:T.sans,fontWeight:600,letterSpacing:"0.06em",textTransform:"uppercase"}}>Ver todo →</button></div>
        {sorted.slice(0,8).map((e,i)=><EntryRow key={e.notionId||i} e={e} showBucket/>)}
        {sorted.length===0&&<div style={{padding:"28px 0",color:T.inkDim,fontSize:13,fontFamily:T.sans,textAlign:"center"}}>Sin movimientos. Empezá con el botón +</div>}
      </div>
    </Shell>);
  }

  // ── MOVIMIENTOS ───────────────────────────────────────────
  if(nav==="movimientos") return (<Shell><AddModal showAdd={showAdd} setShowAdd={setShowAdd} form={form} setForm={setForm} formErr={formErr} setFormErr={setFormErr} handleAdd={handleAdd} saving={saving} listening={listening} voiceText={voiceText} voiceParsing={voiceParsing} startVoice={startVoice} err={err} colaboradores={colaboradores} proyectos={proyectos}/>
    <div style={{padding:"24px 28px 16px",borderBottom:`1px solid ${T.rule}`}}>
      <div style={{fontFamily:T.disp,fontSize:22,fontWeight:700,color:T.ink}}>Movimientos</div>
      <div style={{fontSize:11,color:T.inkDim,marginTop:3}}>{all.length} registros · Notion</div>
    </div>
    <div style={{display:"flex",borderBottom:`1px solid ${T.rule}`}}>
      {[["all","Todos"],["personal","Personal"],["compartido","Compartido"],["mh","MeinHaus"]].map(([k,l])=>(
        <button key={k} onClick={()=>setMovFilter(k)} style={{flex:1,padding:"10px 8px",background:"none",border:"none",borderBottom:`2px solid ${movFilter===k?T.accent:"transparent"}`,fontSize:10,fontFamily:T.sans,fontWeight:600,letterSpacing:"0.06em",color:movFilter===k?T.accent:T.inkDim,textTransform:"uppercase"}}>{l}</button>
      ))}
    </div>
    <div style={{padding:"10px 20px",borderBottom:`1px solid ${T.ruleL}`}}>
      <input style={{width:"100%",padding:"7px 10px",border:`1px solid ${T.rule}`,background:T.paper,fontSize:13,color:T.ink,fontFamily:T.sans}} placeholder="Buscar…" value={movSearch} onChange={e=>setMovSearch(e.target.value)}/>
    </div>
    <ErrBanner/>
    <div style={{padding:"0 28px"}}>
      {movSearch&&<div style={{padding:"8px 0",fontSize:10,color:T.inkDim,fontFamily:T.mono}}>{movList.length} resultado{movList.length!==1?"s":""} para "{movSearch}"</div>}
      {movList.length===0?<div style={{padding:"40px 0",textAlign:"center",color:T.inkDim,fontSize:13}}>Sin movimientos</div>:movList.map((e,i)=><EntryRow key={e.notionId||i} e={e} showBucket={movFilter==="all"}/>)}
    </div>
  </Shell>);

  // ── TARJETA ───────────────────────────────────────────────
  if(nav==="tarjeta") {
    const diasCierre=daysUntil(cfg.cierreBBVA);
    const cuotasPorMes={};
    cuotas.forEach(c=>{
      const m=c.mesDebito?.slice(0,7)||"";
      if(!cuotasPorMes[m]) cuotasPorMes[m]={mes:m,label:m?MESES[(parseInt(m.split("-")[1])||1)-1]+" "+m.split("-")[0]:"—",total:0,cuotas:[]};
      cuotasPorMes[m].total+=c.montoCuota;
      cuotasPorMes[m].cuotas.push(c);
    });
    const meses=Object.values(cuotasPorMes).sort((a,b)=>a.mes.localeCompare(b.mes));
    return (<Shell><AddModal showAdd={showAdd} setShowAdd={setShowAdd} form={form} setForm={setForm} formErr={formErr} setFormErr={setFormErr} handleAdd={handleAdd} saving={saving} listening={listening} voiceText={voiceText} voiceParsing={voiceParsing} startVoice={startVoice} err={err} colaboradores={colaboradores} proyectos={proyectos}/>
      <div style={{padding:"24px 28px 16px",borderBottom:`1px solid ${T.rule}`}}>
        <div style={{fontFamily:T.disp,fontSize:22,fontWeight:700,color:T.ink}}>Tarjeta</div>
        <div style={{fontSize:11,color:T.inkDim,marginTop:3}}>BBVA Personal · Cuotas y cierre</div>
      </div>

      {/* Config cierre */}
      <div style={{padding:"16px 28px",borderBottom:`1px solid ${T.rule}`,background:T.paper}}>
        <Lbl mb={12}>Configuración</Lbl>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
          <div>
            <label style={lblStyle}>Fecha de cierre BBVA</label>
            <input style={{...inpStyle,fontFamily:T.mono,fontSize:12}} type="date" value={cfg.cierreBBVA||""}
              onChange={e=>saveCfg({...cfg,cierreBBVA:e.target.value})}/>
            <div style={{fontSize:10,color:T.inkDim,marginTop:4}}>Actualizarlo cada mes</div>
          </div>
          {cfg.cierreBBVA&&<div style={{display:"flex",flexDirection:"column",justifyContent:"center"}}>
            {diasCierre!==null&&(<>
              <Lbl mb={4}>Días para cierre</Lbl>
              <div className="num" style={{fontSize:28,fontWeight:500,color:diasCierre<=7?T.neg:diasCierre<=14?T.warn:T.ink}}>{diasCierre}</div>
              <div style={{fontSize:10,color:T.inkDim,marginTop:4}}>Comprometido: {ars(cuotasProxCierre.reduce((s,c)=>s+c.montoCuota,0))}</div>
            </>)}
          </div>}
        </div>
      </div>

      {/* Cuotas por mes */}
      <div style={{padding:"20px 28px"}}>
        <Lbl mb={14}>Débitos por mes</Lbl>
        {meses.length===0&&<div style={{color:T.inkDim,fontSize:13,padding:"20px 0"}}>Sin cuotas registradas. Cargá un gasto en cuotas con el botón +</div>}
        {meses.map(m=>(
          <div key={m.mes} style={{marginBottom:16,padding:16,background:T.paper,border:`1px solid ${T.rule}`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <div style={{fontFamily:T.disp,fontSize:15,fontWeight:600,color:T.ink}}>{m.label}</div>
              <div className="num" style={{fontSize:16,fontWeight:500,color:T.accent}}>{ars(m.total)}</div>
            </div>
            {m.cuotas.map((c,i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",borderTop:`1px solid ${T.ruleL}`}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:12,color:T.ink}}>{c.descOriginal||c.desc}</div>
                  <div style={{fontSize:10,color:T.inkDim,marginTop:2,fontFamily:T.mono}}>
                    Cuota {c.cuotaN}/{c.totalCuotas} · {c.tarjeta}
                  </div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <div className="num" style={{fontSize:13,color:c.estado==="Debitado"?T.inkDim:T.ink}}>{ars(c.montoCuota)}</div>
                  {c.estado==="Pendiente"?(<button onClick={()=>marcarCuotaPagada(c)} style={{fontSize:9,padding:"3px 8px",background:T.cream,color:T.pos,border:`1px solid ${T.pos}`,fontFamily:T.sans,fontWeight:600,letterSpacing:"0.05em",textTransform:"uppercase"}}>✓ Debitado</button>)
                  :(<Chip label="Debitado" color={T.pos} bg={T.posL}/>)}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </Shell>);
  }

  // ── EQUIPO ────────────────────────────────────────────────
  if(nav==="equipo") {
    const honDeColab = selectedColab ? honorarios.filter(h=>h.colaborador===selectedColab.nombre||h.colaborador===selectedColab.desc) : [];
    const pagosDeColab = selectedColab ? pagosColab.filter(p=>p.colaborador===selectedColab.nombre||p.colaborador===selectedColab.desc) : [];
    const saldoColab = honDeColab.reduce((s,h)=>s+Math.max(0,(h.montoPactado||0)-(h.totalAdelantado||0)),0);

    if(colabScreen==="newColab") return (<Shell><AddModal showAdd={showAdd} setShowAdd={setShowAdd} form={form} setForm={setForm} formErr={formErr} setFormErr={setFormErr} handleAdd={handleAdd} saving={saving} listening={listening} voiceText={voiceText} voiceParsing={voiceParsing} startVoice={startVoice} err={err} colaboradores={colaboradores} proyectos={proyectos}/>
      <div style={{padding:"24px 28px 16px",borderBottom:`1px solid ${T.rule}`}}>
        <button onClick={()=>setColabScreen("list")} style={{background:"none",border:"none",fontSize:10,color:T.inkDim,fontFamily:T.sans,fontWeight:600,letterSpacing:"0.06em",padding:0,marginBottom:10,display:"block",textTransform:"uppercase"}}>← VOLVER</button>
        <div style={{fontFamily:T.disp,fontSize:20,fontWeight:700,color:T.ink}}>Nuevo colaborador</div>
      </div>
      <div style={{padding:"20px 28px",display:"flex",flexDirection:"column",gap:14}}>
        <div><label style={lblStyle}>Nombre</label><input style={inpStyle} placeholder="Nombre y apellido" value={form.colabNombre} onChange={e=>setForm(f=>({...f,colabNombre:e.target.value}))}/></div>
        <div><label style={lblStyle}>Especialidad</label><select style={selStyle} value={form.colabEspecialidad} onChange={e=>setForm(f=>({...f,colabEspecialidad:e.target.value}))}>
          {["Construcción","Diseño","Electricidad","Plomería","Carpintería","Pintura","Administración","Otro"].map(s=><option key={s}>{s}</option>)}
        </select></div>
        <div><label style={lblStyle}>Contacto (opcional)</label><input style={inpStyle} placeholder="Teléfono o email" value={form.colabContacto} onChange={e=>setForm(f=>({...f,colabContacto:e.target.value}))}/></div>
        {formErr&&<div style={{padding:"7px 10px",background:T.negL,border:`1px solid ${T.neg}`,fontSize:11,color:T.neg}}>{formErr}</div>}
        <div style={{display:"flex",gap:10}}><Btn onClick={()=>setColabScreen("list")}>Cancelar</Btn><Btn primary full onClick={handleNewColab} disabled={saving}>{saving?"Guardando…":"Guardar →"}</Btn></div>
      </div>
    </Shell>);

    if(colabScreen==="newHonorario") return (<Shell><AddModal showAdd={showAdd} setShowAdd={setShowAdd} form={form} setForm={setForm} formErr={formErr} setFormErr={setFormErr} handleAdd={handleAdd} saving={saving} listening={listening} voiceText={voiceText} voiceParsing={voiceParsing} startVoice={startVoice} err={err} colaboradores={colaboradores} proyectos={proyectos}/>
      <div style={{padding:"24px 28px 16px",borderBottom:`1px solid ${T.rule}`}}>
        <button onClick={()=>setColabScreen("list")} style={{background:"none",border:"none",fontSize:10,color:T.inkDim,fontFamily:T.sans,fontWeight:600,letterSpacing:"0.06em",padding:0,marginBottom:10,display:"block",textTransform:"uppercase"}}>← VOLVER</button>
        <div style={{fontFamily:T.disp,fontSize:20,fontWeight:700,color:T.ink}}>Nuevo honorario</div>
      </div>
      <div style={{padding:"20px 28px",display:"flex",flexDirection:"column",gap:14}}>
        <div><label style={lblStyle}>Colaborador</label><select style={selStyle} value={form.honColaborador} onChange={e=>setForm(f=>({...f,honColaborador:e.target.value}))}>
          <option value="">Seleccionar…</option>
          {colaboradores.map(c=><option key={c.notionId}>{c.nombre||c.desc}</option>)}
        </select></div>
        <div><label style={lblStyle}>Proyecto</label><input style={inpStyle} placeholder="ej: Casa Bariloche" value={form.honProyecto} onChange={e=>setForm(f=>({...f,honProyecto:e.target.value}))}/></div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <div><label style={lblStyle}>Monto pactado</label><input style={{...inpStyle,fontFamily:T.mono}} type="number" placeholder="0" value={form.honMonto} onChange={e=>setForm(f=>({...f,honMonto:e.target.value}))}/></div>
          <div><label style={lblStyle}>Fecha inicio</label><input style={{...inpStyle,fontFamily:T.mono,fontSize:12}} type="date" value={form.honFechaInicio} onChange={e=>setForm(f=>({...f,honFechaInicio:e.target.value}))}/></div>
        </div>
        <div><label style={lblStyle}>Notas</label><input style={inpStyle} placeholder="Descripción del trabajo" value={form.honNotas} onChange={e=>setForm(f=>({...f,honNotas:e.target.value}))}/></div>
        {formErr&&<div style={{padding:"7px 10px",background:T.negL,border:`1px solid ${T.neg}`,fontSize:11,color:T.neg}}>{formErr}</div>}
        <div style={{display:"flex",gap:10}}><Btn onClick={()=>setColabScreen("list")}>Cancelar</Btn><Btn primary full onClick={handleNewHonorario} disabled={saving}>{saving?"Guardando…":"Guardar →"}</Btn></div>
      </div>
    </Shell>);

    if(colabScreen==="newPago") return (<Shell><AddModal showAdd={showAdd} setShowAdd={setShowAdd} form={form} setForm={setForm} formErr={formErr} setFormErr={setFormErr} handleAdd={handleAdd} saving={saving} listening={listening} voiceText={voiceText} voiceParsing={voiceParsing} startVoice={startVoice} err={err} colaboradores={colaboradores} proyectos={proyectos}/>
      <div style={{padding:"24px 28px 16px",borderBottom:`1px solid ${T.rule}`}}>
        <button onClick={()=>setColabScreen(selectedColab?"detail":"list")} style={{background:"none",border:"none",fontSize:10,color:T.inkDim,fontFamily:T.sans,fontWeight:600,letterSpacing:"0.06em",padding:0,marginBottom:10,display:"block",textTransform:"uppercase"}}>← VOLVER</button>
        <div style={{fontFamily:T.disp,fontSize:20,fontWeight:700,color:T.ink}}>Registrar pago</div>
      </div>
      <div style={{padding:"20px 28px",display:"flex",flexDirection:"column",gap:14}}>
        <div><label style={lblStyle}>Colaborador</label><select style={selStyle} value={form.pagoColaborador} onChange={e=>setForm(f=>({...f,pagoColaborador:e.target.value}))}>
          <option value="">Seleccionar…</option>
          {colaboradores.map(c=><option key={c.notionId}>{c.nombre||c.desc}</option>)}
        </select></div>
        <div><label style={lblStyle}>Proyecto</label><input style={inpStyle} placeholder="ej: Casa Bariloche" value={form.pagoProyecto} onChange={e=>setForm(f=>({...f,pagoProyecto:e.target.value}))}/></div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <div><label style={lblStyle}>Monto</label><input style={{...inpStyle,fontFamily:T.mono}} type="number" placeholder="0" value={form.pagoMonto} onChange={e=>setForm(f=>({...f,pagoMonto:e.target.value}))}/></div>
          <div><label style={lblStyle}>Fecha</label><input style={{...inpStyle,fontFamily:T.mono,fontSize:12}} type="date" value={form.pagoFecha} onChange={e=>setForm(f=>({...f,pagoFecha:e.target.value}))}/></div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <div><label style={lblStyle}>Tipo</label><select style={selStyle} value={form.pagoTipo} onChange={e=>setForm(f=>({...f,pagoTipo:e.target.value}))}><option>Adelanto</option><option>Pago final</option><option>Ajuste</option></select></div>
          <div><label style={lblStyle}>Método</label><select style={selStyle} value={form.pagoMetodo} onChange={e=>setForm(f=>({...f,pagoMetodo:e.target.value}))}><option>Transferencia</option><option>Efectivo</option><option>Otro</option></select></div>
        </div>
        <div><label style={lblStyle}>Notas</label><input style={inpStyle} placeholder="Opcional" value={form.pagoNotas} onChange={e=>setForm(f=>({...f,pagoNotas:e.target.value}))}/></div>
        {formErr&&<div style={{padding:"7px 10px",background:T.negL,border:`1px solid ${T.neg}`,fontSize:11,color:T.neg}}>{formErr}</div>}
        <div style={{display:"flex",gap:10}}><Btn onClick={()=>setColabScreen(selectedColab?"detail":"list")}>Cancelar</Btn><Btn primary full onClick={handleNewPagoColab} disabled={saving}>{saving?"Guardando…":"Guardar →"}</Btn></div>
      </div>
    </Shell>);

    if(colabScreen==="detail"&&selectedColab) return (<Shell><AddModal showAdd={showAdd} setShowAdd={setShowAdd} form={form} setForm={setForm} formErr={formErr} setFormErr={setFormErr} handleAdd={handleAdd} saving={saving} listening={listening} voiceText={voiceText} voiceParsing={voiceParsing} startVoice={startVoice} err={err} colaboradores={colaboradores} proyectos={proyectos}/>
      <div style={{padding:"24px 28px 16px",borderBottom:`1px solid ${T.rule}`}}>
        <button onClick={()=>{setColabScreen("list");setSelectedColab(null);}} style={{background:"none",border:"none",fontSize:10,color:T.inkDim,fontFamily:T.sans,fontWeight:600,letterSpacing:"0.06em",padding:0,marginBottom:10,display:"block",textTransform:"uppercase"}}>← EQUIPO</button>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div>
            <div style={{fontFamily:T.disp,fontSize:22,fontWeight:700,color:T.ink}}>{selectedColab.nombre||selectedColab.desc}</div>
            <div style={{fontSize:11,color:T.inkDim,marginTop:3}}>{selectedColab.especialidad}</div>
          </div>
          <Btn small primary onClick={()=>{setForm(f=>({...f,pagoColaborador:selectedColab.nombre||selectedColab.desc}));setColabScreen("newPago");}} color={T.pos}>+ Pago</Btn>
        </div>
      </div>
      <div style={{padding:"20px 28px"}}>
        {/* Saldo */}
        <div style={{padding:16,background:saldoColab>0?T.negL:T.posL,border:`1px solid ${saldoColab>0?T.neg:T.pos}`,marginBottom:20}}>
          <Lbl color={saldoColab>0?T.neg:T.pos} mb={6}>Saldo pendiente</Lbl>
          <div className="num" style={{fontSize:28,fontWeight:500,color:saldoColab>0?T.neg:T.pos}}>{ars(saldoColab)}</div>
        </div>
        {/* Proyectos */}
        <Lbl mb={12}>Proyectos</Lbl>
        {honDeColab.length===0&&<div style={{color:T.inkDim,fontSize:13,marginBottom:16}}>Sin proyectos. <button onClick={()=>setColabScreen("newHonorario")} style={{background:"none",border:"none",color:T.accent,fontSize:13,textDecoration:"underline",cursor:"pointer"}}>Agregar</button></div>}
        {honDeColab.map((h,i)=>{
          const saldo=Math.max(0,(h.montoPactado||0)-(h.totalAdelantado||0));
          return (<div key={i} style={{padding:"12px 0",borderBottom:`1px solid ${T.ruleL}`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
              <div>
                <div style={{fontSize:14,fontWeight:500,color:T.ink}}>{h.proyecto}</div>
                <div style={{fontSize:11,color:T.inkDim,marginTop:2}}>Pactado {ars(h.montoPactado||0)} · Adelantado {ars(h.totalAdelantado||0)}</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div className="num" style={{fontSize:15,color:saldo>0?T.neg:T.pos}}>{ars(saldo)}</div>
                <Chip label={h.estado||"En curso"} color={T.inkMid}/>
              </div>
            </div>
          </div>);
        })}
        {/* Pagos */}
        {pagosDeColab.length>0&&<><Lbl mt={20} mb={12}>Historial de pagos</Lbl>
        {pagosDeColab.map((p,i)=>(<div key={i} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:`1px solid ${T.ruleL}`}}>
          <div><div style={{fontSize:13,color:T.ink}}>{p.proyecto||"—"}</div><div style={{fontSize:10,color:T.inkDim,marginTop:2}}>{p.tipo} · {p.fecha}</div></div>
          <div className="num" style={{fontSize:14,color:T.pos}}>{ars(p.monto)}</div>
        </div>))}</>}
      </div>
    </Shell>);

    // ── Equipo list
    const totalDeudaGlobal=deudaColab.reduce((s,c)=>s+c.saldo,0);
    return (<Shell><AddModal showAdd={showAdd} setShowAdd={setShowAdd} form={form} setForm={setForm} formErr={formErr} setFormErr={setFormErr} handleAdd={handleAdd} saving={saving} listening={listening} voiceText={voiceText} voiceParsing={voiceParsing} startVoice={startVoice} err={err} colaboradores={colaboradores} proyectos={proyectos}/>
      <div style={{padding:"24px 28px 16px",borderBottom:`1px solid ${T.rule}`}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div><div style={{fontFamily:T.disp,fontSize:22,fontWeight:700,color:T.ink}}>Equipo</div>
            <div style={{fontSize:11,color:T.inkDim,marginTop:3}}>Colaboradores · Honorarios</div></div>
          <div style={{display:"flex",gap:8}}>
            <Btn small onClick={()=>setColabScreen("newHonorario")}>+ Proyecto</Btn>
            <Btn small primary onClick={()=>setColabScreen("newColab")}>+ Persona</Btn>
          </div>
        </div>
      </div>

      {totalDeudaGlobal>0&&<div style={{padding:"14px 28px",background:T.negL,borderBottom:`1px solid ${T.rule}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div><Lbl color={T.neg} mb={4}>Total deuda a colaboradores</Lbl>
          <div className="num" style={{fontSize:22,color:T.neg,fontWeight:500}}>{ars(totalDeudaGlobal)}</div></div>
        <Btn small primary danger onClick={()=>setColabScreen("newPago")}>Registrar pago</Btn>
      </div>}

      <div style={{padding:"20px 28px"}}>
        {colaboradores.length===0&&<div style={{color:T.inkDim,fontSize:13,padding:"20px 0"}}>Sin colaboradores. Agregá el primero con el botón de arriba.</div>}
        {colaboradores.map((c,i)=>{
          const nombre=c.nombre||c.desc||"—";
          const info=deudaColab.find(d=>d.nombre===nombre);
          const saldo=info?.saldo||0;
          return (<div key={i} onClick={()=>{setSelectedColab(c);setColabScreen("detail");}} style={{padding:"14px 0",borderBottom:`1px solid ${T.ruleL}`,cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{fontSize:15,fontWeight:500,color:T.ink}}>{nombre}</div>
              <div style={{fontSize:11,color:T.inkDim,marginTop:3}}>{c.especialidad} {info?.proyectos?.length?`· ${info.proyectos.slice(0,2).join(", ")}`:""}</div>
            </div>
            <div style={{textAlign:"right"}}>
              {saldo>0?<div className="num" style={{fontSize:16,fontWeight:500,color:T.neg}}>{ars(saldo)}</div>:<Chip label="Al día" color={T.pos} bg={T.posL}/>}
            </div>
          </div>);
        })}
      </div>
    </Shell>);
  }

  // ── ANÁLISIS ──────────────────────────────────────────────
  if(nav==="analisis") {
    const spent=stats.persEgr, left=Math.max(0,cfg.ingresoMensual-spent);
    const ahorroR=cfg.ingresoMensual>0?pct(left,cfg.ingresoMensual):null;
    return (<Shell><AddModal showAdd={showAdd} setShowAdd={setShowAdd} form={form} setForm={setForm} formErr={formErr} setFormErr={setFormErr} handleAdd={handleAdd} saving={saving} listening={listening} voiceText={voiceText} voiceParsing={voiceParsing} startVoice={startVoice} err={err} colaboradores={colaboradores} proyectos={proyectos}/>
      <div style={{padding:"24px 28px 20px",borderBottom:`1px solid ${T.rule}`}}>
        <div style={{fontFamily:T.disp,fontSize:22,fontWeight:700,color:T.ink}}>Análisis</div>
      </div>
      <div style={{padding:"24px 28px",display:"flex",flexDirection:"column",gap:24}}>
        {/* Config */}
        <div style={{padding:16,background:T.paper,border:`1px solid ${T.rule}`}}>
          <Lbl mb={12}>Parámetros</Lbl>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <div><label style={lblStyle}>Ingreso mensual</label><input style={{...inpStyle,fontFamily:T.mono}} type="number" placeholder="0" value={cfg.ingresoMensual||""} onChange={e=>saveCfg({...cfg,ingresoMensual:Number(e.target.value)||0})}/></div>
            <div><label style={lblStyle}>Meta ahorro %</label><input style={{...inpStyle,fontFamily:T.mono}} type="number" placeholder="20" value={cfg.metaAhorro||""} onChange={e=>saveCfg({...cfg,metaAhorro:Number(e.target.value)||20})}/></div>
          </div>
          {cfg.ingresoMensual>0&&<div style={{marginTop:14,paddingTop:14,borderTop:`1px solid ${T.rule}`,display:"flex",gap:0,border:`1px solid ${T.rule}`}}>
            {[["Gastado",ars(spent),spent>cfg.ingresoMensual?T.neg:T.ink],["Disponible",ars(left),T.pos],["Ahorro",`${ahorroR}%`,ahorroR>=cfg.metaAhorro?T.pos:T.neg]].map(([l,v,c],i)=>(
              <div key={l} style={{flex:1,padding:"10px 14px",borderRight:i<2?`1px solid ${T.rule}`:"none"}}>
                <Lbl mb={5}>{l}</Lbl><div className="num" style={{fontSize:15,color:c,fontWeight:500}}>{v}</div>
              </div>
            ))}
          </div>}
        </div>
        {/* Charts */}
        {stats.months.length>0&&<div>
          <Lbl mb={14}>Flujo mensual</Lbl>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={stats.months} barCategoryGap="28%">
              <XAxis dataKey="label" tick={{fill:T.inkDim,fontSize:9,fontFamily:T.sans,fontWeight:600}} axisLine={{stroke:T.rule}} tickLine={false}/>
              <YAxis tick={{fill:T.inkDim,fontSize:8,fontFamily:T.mono}} axisLine={false} tickLine={false} tickFormatter={v=>"$"+Math.round(v/1000)+"k"}/>
              <Tooltip content={<ChartTip/>}/>
              <Bar dataKey="persEgr" fill={T.inkMid} name="Personal"    radius={[1,1,0,0]} barSize={9}/>
              <Bar dataKey="mhEgr"   fill={T.ink}    name="MH Egresos"  radius={[1,1,0,0]} barSize={9}/>
              <Bar dataKey="mhIng"   fill={T.accent} name="MH Ingresos" radius={[1,1,0,0]} barSize={9}/>
            </BarChart>
          </ResponsiveContainer>
        </div>}
        <Rule/>
        <div>
          <Lbl mb={12}>MeinHaus</Lbl>
          <div style={{display:"flex",border:`1px solid ${T.rule}`}}>
            {[["Ingresos",ars(stats.mhIng),T.pos],["Egresos",ars(stats.mhEgr),T.neg],["Neto",signStr(stats.mhNeto),stats.mhNeto>=0?T.pos:T.neg],...(stats.mhIng>0?[["Margen",`${pct(stats.mhNeto,stats.mhIng)}%`,stats.mhNeto>=0?T.pos:T.neg]]:[])].map(([l,v,c],i,arr)=>(
              <div key={l} style={{flex:1,padding:"12px 10px",borderRight:i<arr.length-1?`1px solid ${T.rule}`:"none"}}>
                <Lbl mb={5}>{l}</Lbl><div className="num" style={{fontSize:13,fontWeight:500,color:c}}>{v}</div>
              </div>
            ))}
          </div>
        </div>
        {stats.mhCatData.length>0&&<div>
          <Lbl mb={14}>MH egresos por rubro</Lbl>
          {stats.mhCatData.map((d,i)=>{const max=stats.mhCatData[0]?.value||1;return(<div key={d.name} style={{marginBottom:10}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:12,color:T.inkMid}}>{d.name}</span><span className="num" style={{fontSize:12,color:T.ink}}>{ars(d.value)}</span></div>
            <div style={{height:2,background:T.rule}}><div style={{height:"100%",background:i===0?T.ink:T.inkMid,width:`${pct(d.value,max)}%`,transition:"width 0.5s"}}/></div>
          </div>);})}
        </div>}
        {stats.catData.length>0&&<><Rule/>
          <div><Lbl mb={14}>Personal por categoría</Lbl>
            <div style={{display:"flex",gap:16,alignItems:"center"}}>
              <PieChart width={100} height={100}><Pie data={stats.catData} cx={46} cy={46} innerRadius={26} outerRadius={46} dataKey="value" paddingAngle={2} startAngle={90} endAngle={-270}>{stats.catData.map((_,i)=><Cell key={i} fill={CAT_COLORS[i%CAT_COLORS.length]}/>)}</Pie></PieChart>
              <div style={{flex:1,display:"flex",flexDirection:"column",gap:6}}>
                {stats.catData.slice(0,7).map((d,i)=>(<div key={d.name} style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div style={{display:"flex",alignItems:"center",gap:6}}><div style={{width:6,height:6,background:CAT_COLORS[i%CAT_COLORS.length]}}/><span style={{fontSize:10,color:T.inkMid}}>{d.name}</span></div>
                  <span className="num" style={{fontSize:10,color:T.ink}}>{ars(d.value)}</span>
                </div>))}
              </div>
            </div>
          </div>
        </>}
      </div>
    </Shell>);
  }

  // ── CONSEJERO ─────────────────────────────────────────────
  if(nav==="consejero") return (<Shell><AddModal showAdd={showAdd} setShowAdd={setShowAdd} form={form} setForm={setForm} formErr={formErr} setFormErr={setFormErr} handleAdd={handleAdd} saving={saving} listening={listening} voiceText={voiceText} voiceParsing={voiceParsing} startVoice={startVoice} err={err} colaboradores={colaboradores} proyectos={proyectos}/>
    <div style={{padding:"24px 28px 20px",borderBottom:`1px solid ${T.rule}`}}>
      <div style={{fontFamily:T.disp,fontSize:22,fontWeight:700,color:T.ink}}>Asesor</div>
      <div style={{fontSize:11,color:T.inkDim,marginTop:3}}>Análisis IA · datos reales de Notion</div>
    </div>
    <div style={{padding:"24px 28px",display:"flex",flexDirection:"column",gap:16}}>
      <div style={{display:"flex",border:`1px solid ${T.rule}`}}>
        {[["Personal",ars(stats.persEgr),T.ink],["MH neto",signStr(stats.mhNeto),stats.mhNeto>=0?T.pos:T.neg],["Compartido",stats.balOut>0?ars(stats.balOut):"Al día",stats.balOut>0?T.accent:T.pos]].map(([l,v,c],i)=>(
          <div key={l} style={{flex:1,padding:"12px 14px",borderRight:i<2?`1px solid ${T.rule}`:"none"}}>
            <Lbl mb={5}>{l}</Lbl><div className="num" style={{fontSize:14,color:c,fontWeight:500}}>{v}</div>
          </div>
        ))}
      </div>
      <Btn primary full onClick={()=>getAdvice(stats)} disabled={advLoad}>{advLoad?"Analizando…":"Analizar mis finanzas →"}</Btn>
      {advice&&<div className="fade" style={{padding:"18px 20px",background:T.paper,border:`1px solid ${T.rule}`,borderLeft:`3px solid ${T.accent}`}}>
        <Lbl color={T.accent} mb={12}>Análisis</Lbl>
        <div style={{fontSize:13,color:T.ink,lineHeight:1.8,fontFamily:T.sans,whiteSpace:"pre-wrap"}}>{advice}</div>
      </div>}
    </div>
  </Shell>);

  return null;
}
