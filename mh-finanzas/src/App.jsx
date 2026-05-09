import { useState, useEffect, useCallback, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

// ── Notion ────────────────────────────────────────────────────
const DS_COMPARTIDO     = "9b24a733-623b-45c6-b569-54dca1627d5b";
const DB_COMPARTIDO_URL = "https://www.notion.so/4a59e3a1c4034368b92e9cd6884b19ec";
const DS_MH             = "2c3de50f-21d6-8054-adcc-000bf2b3fe10";
const DB_MH_URL         = "https://www.notion.so/2c0de50f21d6802fbc8ff6570cad8a26";
const DS_PERSONAL       = "39e820e0-3969-498e-a549-d9e4074a2762";
const DB_PERSONAL_URL   = "https://www.notion.so/d53edbb031404fbe9247516b86b54d83";
const MCP               = [{ type:"url", url:"https://mcp.notion.com/mcp", name:"notion" }];
const CFG_KEY           = "mh-fin-cfg-v4";

// ── Constants ─────────────────────────────────────────────────
const CATS = {
  personal:   ["Comida","Transporte","Salud","Ocio","Ropa","Suscripciones","Educación","Otros"],
  compartido: ["Vivienda","Comida","Servicios","Salud","Ocio","Transporte","Otros"],
  mh:         ["Materiales obra","Materiales mobiliario","Mano de obra / Colaboradores",
               "Honorarios profesionales","Combustible / Logística","Herramientas / Inversión",
               "Marketing / Comunicación","Impuestos / Tasas","Alquiler / Servicios / Taller",
               "Ventas / Proyectos","Varios"],
};
const METODOS = ["Débito","Crédito","Efectivo","Transferencia","MercadoPago"];
const MESES   = ["ENE","FEB","MAR","ABR","MAY","JUN","JUL","AGO","SEP","OCT","NOV","DIC"];
const CAT_COLORS = ["#B85C2A","#5C7A8A","#4A6A5A","#8A5C3A","#5C5A8A","#7A5C5A","#4A7A6A","#8A7A5C"];

// ── Tokens ────────────────────────────────────────────────────
const T = {
  cream:"#F4F1EB", paper:"#EDEAE2", rule:"#D4D0C7", ruleL:"#E5E2D8",
  ink:"#1A1917", inkMid:"#5C5A54", inkDim:"#9C9990",
  accent:"#B85C2A", accentL:"#F5EBE3",
  pos:"#2A6647", posL:"#DAF0E4",
  neg:"#8A2A2A", negL:"#F5DADA",
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
const prevMonth = () => {
  const d = new Date(); d.setMonth(d.getMonth()-1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
};

// ── Voice parsing ─────────────────────────────────────────────
// parseVoiceInput replaced above in deployed version

// ── API calls ─────────────────────────────────────────────────
// callNotion replaced by queryDB/createPage in deployed version

// callClaude replaced by claudeCall proxy in deployed version


// ── Notion DB IDs (REST API) ──────────────────────────────────
const DB_IDS = {
  personal:   "d53edbb031404fbe9247516b86b54d83",
  compartido: "4a59e3a1c4034368b92e9cd6884b19ec",
  mh:         "2c0de50f21d6802fbc8ff6570cad8a26",
};
const NOTION_TOKEN_KEY = "mh_notion_token";
const getStoredToken = () => { try { return localStorage.getItem(NOTION_TOKEN_KEY); } catch { return null; } };

// ── Direct Notion API calls ───────────────────────────────────
async function queryDB(dbId, type, token) {
  try {
    const res = await fetch(`/api?action=query`, {
      method: "POST",
      headers: { "Content-Type":"application/json", "x-notion-token":token },
      body: JSON.stringify({ dbId, type }),
    });
    const data = await res.json();
    if (data.error) return { error: data.error };
    return Array.isArray(data) ? data : [];
  } catch(e) { return { error: String(e) }; }
}

async function createPage(dbId, properties, token) {
  try {
    const res = await fetch(`/api?action=create`, {
      method: "POST",
      headers: { "Content-Type":"application/json", "x-notion-token":token },
      body: JSON.stringify({ dbId, properties }),
    });
    return res.json();
  } catch(e) { return { error: String(e) }; }
}

// ── Build Notion property objects ─────────────────────────────
function notionProps(bucket, { desc, monto, pago, cat, fecha, metodo, mhTipo, estado="Pendiente" }) {
  const title = (name, val) => ({ [name]: { title: [{ text: { content: val } }] } });
  const num   = (name, val) => ({ [name]: { number: val } });
  const sel   = (name, val) => ({ [name]: { select: { name: val } } });
  const msel  = (name, val) => ({ [name]: { multi_select: [{ name: val }] } });
  const date  = (name, val) => ({ [name]: { date: { start: val } } });

  if (bucket === "personal") return {
    ...title("Descripción", desc), ...num("Monto", monto),
    ...sel("Categoría", cat), ...date("Fecha", fecha),
    ...(metodo ? sel("Método de pago", metodo) : {}),
  };
  if (bucket === "compartido") return {
    ...title("Descripción", desc), ...num("Monto", monto),
    ...sel("Pagó", pago), ...sel("Categoría", cat),
    ...date("Fecha", fecha), ...sel("División", "50/50"), ...sel("Estado", estado),
  };
  if (bucket === "mh") return {
    ...title("Movimiento", desc), ...num("Monto", monto),
    ...sel("Tipo", mhTipo === "Ingreso" ? "Ingreso" : "Egreso"),
    ...msel("Categoría", cat), ...date("Fecha", fecha), ...sel("Moneda", "ARS"),
  };
  return {};
}

// ── Claude via proxy ──────────────────────────────────────────
const ANTHROPIC_KEY_STORAGE = "mh_anthropic_key";
const getStoredAnthropicKey = () => { try { return localStorage.getItem(ANTHROPIC_KEY_STORAGE); } catch { return null; } };

async function claudeCall(system, messages, max_tokens = 1200) {
  try {
    // Try Netlify function proxy first (has key server-side)
    const proxyRes = await fetch("/api?action=claude", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ system, messages, max_tokens }),
    });
    if (proxyRes.ok) {
      const d = await proxyRes.json();
      if (!d.error) return (d.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("");
    }
    // Fall back to direct call with stored key
    const key = getStoredAnthropicKey();
    if (!key) return "(Asesor no disponible: configurá la API key de Anthropic en Ajustes)";
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method:"POST",
      headers:{"Content-Type":"application/json","x-api-key":key,"anthropic-version":"2023-06-01"},
      body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens,system,messages}),
    });
    const d = await res.json();
    return (d.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("");
  } catch (e) { return "Error: " + e; }
}

// ── Voice parsing via proxy ───────────────────────────────────
async function parseVoiceInput(transcript) {
  try {
    const text = await claudeCall(
      `Parser de gastos financieros para Mariano Serdoch (Argentina).
Recibís texto hablado y devolvés SOLO JSON válido, sin markdown ni explicación.
Categorías — personal: Comida,Transporte,Salud,Ocio,Ropa,Suscripciones,Educación,Otros
compartido: Vivienda,Comida,Servicios,Salud,Ocio,Transporte,Otros
mh: Materiales obra,Materiales mobiliario,Mano de obra / Colaboradores,Honorarios profesionales,Combustible / Logística,Herramientas / Inversión,Marketing / Comunicación,Impuestos / Tasas,Alquiler / Servicios / Taller,Ventas / Proyectos,Varios
meinhaus/MH/obra/taller→mh | alquiler/expensas/con flor→compartido | resto→personal
50k/50 lucas=50000, 3 millones=3000000`,
      [{ role: "user", content: `Parsear: "${transcript}". JSON: {"desc":"...","monto":0,"bucket":"personal|compartido|mh","cat":"...","pago":"Mariano","mhTipo":"Egreso"}` }],
      300
    );
    const si = text.indexOf("{"), ei = text.lastIndexOf("}");
    return JSON.parse(si >= 0 ? text.slice(si, ei + 1) : text);
  } catch { return null; }
}

// ── Setup Screen ──────────────────────────────────────────────
function SetupScreen({ onToken }) {
  const T = {
    cream:"#F4F1EB", paper:"#EDEAE2", rule:"#D4D0C7",
    ink:"#1A1917", inkMid:"#5C5A54", inkDim:"#9C9990",
    accent:"#B85C2A", accentL:"#F5EBE3", neg:"#8A2A2A", negL:"#F5DADA",
    sans:"'Instrument Sans','Helvetica Neue',Arial,sans-serif",
    mono:"'JetBrains Mono','Courier New',monospace",
    disp:"'Syne','Helvetica Neue',Arial,sans-serif",
  };
  const [token, setToken] = useState("");
  const [testing, setTesting] = useState(false);
  const [err, setErr] = useState("");

  const [apiKey, setApiKey] = useState("");

  const test = async () => {
    if (!token.trim()) { setErr("Pegá el token de Notion"); return; }
    setTesting(true); setErr("");
    try {
      const res = await queryDB(DB_IDS.personal, "personal", token.trim());
      if (res?.error) {
        setErr("Sin acceso. ¿Conectaste la integración a las bases? Error: " + res.error);
        setTesting(false); return;
      }
      // Save both tokens
      try {
        localStorage.setItem(NOTION_TOKEN_KEY, token.trim());
        if (apiKey.trim()) localStorage.setItem(ANTHROPIC_KEY_STORAGE, apiKey.trim());
      } catch {}
      onToken(token.trim());
    } catch(e) {
      setErr("Error de conexión: " + String(e));
    }
    setTesting(false);
  };

  return (
    <div style={{minHeight:"100vh",background:T.cream,display:"flex",
      flexDirection:"column",alignItems:"center",justifyContent:"center",
      padding:24,fontFamily:T.sans}}>
      <div style={{maxWidth:440,width:"100%"}}>
        <div style={{fontFamily:T.disp,fontSize:36,fontWeight:700,
          color:T.ink,letterSpacing:"-0.04em",marginBottom:4}}>MH</div>
        <div style={{fontSize:13,color:T.inkDim,marginBottom:32}}>Finanzas · Primera configuración</div>

        <div style={{fontSize:14,color:T.ink,lineHeight:1.7,marginBottom:24}}>
          Para conectar con tus datos de Notion, necesitás crear una integración interna:
        </div>

        {[
          ["1", "Entrá a notion.so/my-integrations"],
          ["2", "New integration → ponele nombre MH Finanzas → Submit"],
          ["3", "Copiá el Internal Integration Secret (empieza con ntn_ o secret_)"],
          ["4", "Abrí cada base de datos en Notion (Personal, Gastos en común, Finanzas MH) → menú ··· → Connections → conectá la integración"],
        ].map(([n, txt]) => (
          <div key={n} style={{display:"flex",gap:14,marginBottom:14,alignItems:"flex-start"}}>
            <div style={{width:22,height:22,background:T.accent,color:T.cream,
              display:"flex",alignItems:"center",justifyContent:"center",
              flexShrink:0,fontSize:11,fontWeight:700}}>{n}</div>
            <div style={{fontSize:13,color:T.inkMid,lineHeight:1.6}}>{txt}</div>
          </div>
        ))}

        <div style={{marginTop:24}}>
          <label style={{fontSize:10,color:T.inkDim,letterSpacing:"0.08em",
            textTransform:"uppercase",display:"block",marginBottom:6}}>
            Token de integración Notion
          </label>
          <input
            style={{width:"100%",padding:"10px 12px",border:`1.5px solid ${err?T.neg:T.rule}`,
              background:T.cream,fontSize:13,color:T.ink,fontFamily:T.mono,
              boxSizing:"border-box",marginBottom:16}}
            placeholder="ntn_... o secret_..."
            value={token}
            onChange={e=>setToken(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&test()}
          />
          <label style={{fontSize:10,color:T.inkDim,letterSpacing:"0.08em",
            textTransform:"uppercase",display:"block",marginBottom:6}}>
            API Key Anthropic <span style={{color:T.inkDim,fontWeight:400}}>(opcional — para Asesor y Voz)</span>
          </label>
          <input
            style={{width:"100%",padding:"10px 12px",border:`1.5px solid ${T.rule}`,
              background:T.cream,fontSize:13,color:T.ink,fontFamily:T.mono,
              boxSizing:"border-box",marginBottom:err?6:16}}
            placeholder="sk-ant-api03-..."
            value={apiKey}
            onChange={e=>setApiKey(e.target.value)}
          />
          {err && <div style={{fontSize:12,color:T.neg,padding:"6px 8px",
            background:T.negL,marginBottom:16}}>{err}</div>}
          <button onClick={test} disabled={testing}
            style={{width:"100%",padding:"11px",background:T.ink,color:T.cream,
              border:"none",fontSize:12,fontWeight:600,letterSpacing:"0.04em",
              textTransform:"uppercase",cursor:"pointer",opacity:testing?0.5:1}}>
            {testing ? "Verificando…" : "Conectar →"}
          </button>
        </div>

        <div style={{marginTop:20,fontSize:11,color:T.inkDim,lineHeight:1.6}}>
          El token queda guardado solo en este dispositivo. Nunca sale de tu teléfono hacia ningún servidor externo.
        </div>
      </div>
    </div>
  );
}

// ── Stats aggregator ──────────────────────────────────────────
function buildStats(all) {
  const personal   = all.filter(e=>e.bucket==="personal");
  const mh         = all.filter(e=>e.bucket==="mh");
  const comp       = all.filter(e=>e.bucket==="compartido");
  const mhIng      = mh.filter(e=>e.sub==="ingreso").reduce((s,e)=>s+e.monto,0);
  const mhEgr      = mh.filter(e=>e.sub==="egreso").reduce((s,e)=>s+e.monto,0);
  const persEgr    = personal.reduce((s,e)=>s+e.monto,0);

  // Monthly series
  const moMap = {};
  all.forEach(e=>{
    const m=monthOf(e);
    if(!moMap[m]) moMap[m]={label:MESES[(parseInt(m.split("-")[1])||1)-1],persEgr:0,mhIng:0,mhEgr:0};
    if(e.bucket==="personal")             moMap[m].persEgr+=e.monto;
    if(e.bucket==="mh"&&e.sub==="ingreso") moMap[m].mhIng+=e.monto;
    if(e.bucket==="mh"&&e.sub==="egreso")  moMap[m].mhEgr+=e.monto;
  });
  const months = Object.entries(moMap).sort(([a],[b])=>a.localeCompare(b)).map(([,v])=>v);

  // Categories
  const catMap={}, mhCatMap={};
  personal.forEach(e=>{catMap[e.cat||"Otros"]=(catMap[e.cat||"Otros"]||0)+e.monto;});
  mh.filter(e=>e.sub==="egreso").forEach(e=>{mhCatMap[e.cat||"Varios"]=(mhCatMap[e.cat||"Varios"]||0)+e.monto;});
  const catData   = Object.entries(catMap).map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value);
  const mhCatData = Object.entries(mhCatMap).map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value);

  // Balance compartido
  const g  = comp.filter(e=>e.sub==="gasto");
  const mp = g.filter(e=>e.pago==="Mariano").reduce((s,e)=>s+e.monto,0);
  const fp = g.filter(e=>e.pago==="Flor").reduce((s,e)=>s+e.monto,0);
  const tot=mp+fp, raw=(tot/2)-mp;
  const deb=raw>=0?"Mariano":"Flor", cred=raw>=0?"Flor":"Mariano";
  const sett=comp.filter(e=>e.sub==="ajuste"&&e.pago===deb).reduce((s,e)=>s+e.monto,0);
  const balOut=Math.max(0,Math.abs(raw)-sett);

  return {mhIng,mhEgr,mhNeto:mhIng-mhEgr,persEgr,months,catData,mhCatData,balOut,balDeb:deb,balCred:cred,mp,fp,tot};
}

// ── CSS ───────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700&family=Instrument+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{background:${T.cream};color:${T.ink};-webkit-font-smoothing:antialiased}
.num{font-family:${T.mono};font-variant-numeric:tabular-nums;letter-spacing:-0.02em}
input,select{font-family:${T.sans};color:${T.ink};background:${T.cream}}
input:focus,select:focus{outline:2px solid ${T.accent};outline-offset:-1px}
input.err{outline:2px solid ${T.neg};outline-offset:-1px}
button{cursor:pointer;transition:opacity 0.1s}
button:hover{opacity:0.7}
button:active{opacity:0.5}
.spin{animation:spin 0.9s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.fade{animation:fi 0.18s ease}
@keyframes fi{from{opacity:0;transform:translateY(3px)}to{opacity:1;transform:none}}
.pending{opacity:0.5;animation:pulse 1.4s ease-in-out infinite}
@keyframes pulse{0%,100%{opacity:0.5}50%{opacity:0.9}}
.skel{background:linear-gradient(90deg,${T.paper} 25%,${T.ruleL} 50%,${T.paper} 75%);background-size:200% 100%;animation:skel 1.4s ease-in-out infinite;border-radius:2px}
@keyframes skel{0%{background-position:200% 0}100%{background-position:-200% 0}}
@keyframes voicePulse{0%,100%{box-shadow:0 0 0 0 rgba(184,92,42,0.4)}50%{box-shadow:0 0 0 8px rgba(184,92,42,0)}}
::-webkit-scrollbar{width:3px}
::-webkit-scrollbar-thumb{background:${T.rule}}
`;

// ══════════════════════════════════════════════════════════════
// ROOT COMPONENT
// ══════════════════════════════════════════════════════════════
export default function App() {
  // ── ALL HOOKS AT THE TOP — no exceptions ──────────────────
  const [notionToken, setNotionToken] = useState(getStoredToken);
  const [nav,       setNav]       = useState("home");
  const [entries,   setEntries]   = useState({compartido:[],mh:[],personal:[]});
  const [cfg,       setCfg]       = useState({ingresoMensual:0,metaAhorro:20});
  const [loading,   setLoading]   = useState(false);
  const [syncing,   setSyncing]   = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [err,       setErr]       = useState(null);
  const [showAdd,   setShowAdd]   = useState(false);
  const [settle,    setSettle]    = useState(false);
  const [advice,    setAdvice]    = useState("");
  const [advLoad,   setAdvLoad]   = useState(false);
  const [movFilter, setMovFilter] = useState("all");
  const [movSearch, setMovSearch] = useState("");
  const [lastSync,  setLastSync]  = useState(null);
  const [formErr,   setFormErr]   = useState("");
  const [listening, setListening] = useState(false);
  const [voiceText, setVoiceText] = useState("");
  const [voiceParsing, setVoiceParsing] = useState(false);
  const [form,      setForm]      = useState({
    desc:"",monto:"",bucket:"personal",pago:"Mariano",
    cat:"Comida",fecha:today(),metodo:"Débito",mhTipo:"Egreso",
  });

  // ── Config persistence ────────────────────────────────────
  useEffect(()=>{
    (async()=>{
      try{const r=JSON.parse(localStorage.getItem(CFG_KEY));if(r)setCfg(JSON.parse(r.value));}catch{}
    })();
  },[]);
  const saveCfg = async c=>{setCfg(c);try{localStorage.setItem(CFG_KEY,JSON.stringify(c));}catch{}};

  // ── Load data ─────────────────────────────────────────────
  const loadAll = useCallback(async(silent=false)=>{
    const tok = getStoredToken();
    if(!tok) return;
    setSyncing(true);
    // Show UI immediately — load sequentially so mobile doesn't time out
    setLoading(false);
    setErr(null);
    const norm = (arr,bucket,subFn) => Array.isArray(arr)
      ? arr.map(e=>({...e,bucket,sub:subFn(e),monto:Number(e.monto)||0,_pending:false}))
      : [];
    const errs = [];
    try {
      const rP = await queryDB(DB_IDS.personal, "personal", tok);
      if(rP?.error) errs.push("Personal: "+rP.error);
      else setEntries(e=>({...e, personal: norm(rP,"personal",()=>"gasto")}));
    } catch(e){ errs.push("Personal: "+String(e)); }
    try {
      const rC = await queryDB(DB_IDS.compartido, "compartido", tok);
      if(rC?.error) errs.push("Compartido: "+rC.error);
      else setEntries(e=>({...e, compartido: norm(rC,"compartido",x=>x.estado==="Saldado"?"ajuste":"gasto")}));
    } catch(e){ errs.push("Compartido: "+String(e)); }
    try {
      const rM = await queryDB(DB_IDS.mh, "mh", tok);
      if(rM?.error) errs.push("MH: "+rM.error);
      else setEntries(e=>({...e, mh: norm(rM,"mh",x=>(x.tipo||"").toLowerCase()==="ingreso"?"ingreso":"egreso")}));
    } catch(e){ errs.push("MH: "+String(e)); }
    setLastSync(new Date());
    if(errs.length) setErr(errs.join(" · "));
    setSyncing(false);
  },[]);

  useEffect(()=>{loadAll();},[loadAll]);

  // ── Add entry — optimistic ────────────────────────────────
  const handleAdd = async()=>{
    const monto=parseFloat(form.monto);
    if(!form.desc.trim()){ setFormErr("Escribí una descripción"); return; }
    if(isNaN(monto)||monto<=0){ setFormErr("El monto tiene que ser mayor a 0"); return; }
    setFormErr("");
    const tok = getStoredToken();
    const tempId = "pending_"+Date.now();
    const base = {notionId:tempId,desc:form.desc,monto,cat:form.cat,fecha:form.fecha,_pending:true};
    let optimistic;
    if(form.bucket==="personal")      optimistic={...base,metodo:form.metodo,bucket:"personal",sub:"gasto"};
    else if(form.bucket==="compartido") optimistic={...base,pago:form.pago,estado:"Pendiente",bucket:"compartido",sub:"gasto"};
    else optimistic={...base,tipo:form.mhTipo,bucket:"mh",sub:form.mhTipo==="Ingreso"?"ingreso":"egreso"};
    setEntries(e=>({...e,[form.bucket]:[optimistic,...e[form.bucket]]}));
    setForm(f=>({...f,desc:"",monto:""}));
    setShowAdd(false);
    setSaving(true);
    try {
      const props = notionProps(form.bucket, {
        desc:form.desc, monto, pago:form.pago, cat:form.cat,
        fecha:form.fecha, metodo:form.metodo, mhTipo:form.mhTipo,
      });
      const res = await createPage(DB_IDS[form.bucket], props, tok);
      if(res?.success){
        setEntries(e=>({...e,[form.bucket]:e[form.bucket].map(x=>
          x.notionId===tempId ? {...x,notionId:res.notionId,_pending:false} : x
        )}));
      } else {
        setErr(res?.error||"Error al guardar en Notion");
        setEntries(e=>({...e,[form.bucket]:e[form.bucket].filter(x=>x.notionId!==tempId)}));
      }
    } catch(e){
      setErr(String(e));
      setEntries(e2=>({...e2,[form.bucket]:e2[form.bucket].filter(x=>x.notionId!==tempId)}));
    }
    setSaving(false);
  };

  // ── Settle ────────────────────────────────────────────────
  const handleSettle = async(st)=>{
    if(st.balOut<=0) return;
    setSaving(true);
    const tok = getStoredToken();
    const desc=`Saldo · ${st.balDeb} → ${st.balCred}`;
    const props = notionProps("compartido", {
      desc, monto:st.balOut, pago:st.balDeb, cat:"Otros",
      fecha:today(), estado:"Saldado",
    });
    const res = await createPage(DB_IDS.compartido, props, tok);
    if(res?.success){
      setEntries(e=>({...e,compartido:[{notionId:res.notionId,desc,monto:st.balOut,pago:st.balDeb,cat:"Otros",fecha:today(),bucket:"compartido",sub:"ajuste",estado:"Saldado"},...e.compartido]}));
      setSettle(false);
    } else setErr(res?.error||"Error");
    setSaving(false);
  };

  // ── AI advice ─────────────────────────────────────────────
  const getAdvice = async(st)=>{
    setAdvLoad(true); setAdvice("");
    const prompt=`Datos financieros de Mariano (${new Date().toLocaleDateString("es-AR",{month:"long",year:"numeric"})}):\nPERSONAL — Egresos: ${ars(st.persEgr)}. Por categoría: ${st.catData.map(d=>`${d.name} ${ars(d.value)}`).join(", ")||"sin datos"}.\nIngreso mensual: ${cfg.ingresoMensual>0?ars(cfg.ingresoMensual):"no configurado"}. Meta ahorro: ${cfg.metaAhorro}%.${cfg.ingresoMensual>0?` Tasa ahorro real: ${pct(Math.max(0,cfg.ingresoMensual-st.persEgr),cfg.ingresoMensual)}%.`:""}\nMEINHAUS — Ingresos: ${ars(st.mhIng)}, Egresos: ${ars(st.mhEgr)}, Neto: ${signStr(st.mhNeto)}.${st.mhIng>0?` Margen: ${pct(st.mhNeto,st.mhIng)}%.`:""}\nEgresos por rubro: ${st.mhCatData.map(d=>`${d.name} ${ars(d.value)}`).join(", ")||"sin datos"}.\nCOMPARTIDO — Total: ${ars(st.tot)}, Mariano: ${ars(st.mp)}, Flor: ${ars(st.fp)}. Balance: ${st.balOut>0?`${st.balDeb} debe ${ars(st.balOut)} a ${st.balCred}`:"al día"}.\nAnalizá y dame recomendaciones concretas.`;
    setAdvice(await claudeCall(
      "Sos el asesor financiero de Mariano Serdoch — diseñador industrial, director de MeinHaus (Argentina). Directo, sin vueltas, español rioplatense con voseo. Máximo 5 puntos accionables.",
      [{role:"user",content:prompt}]
    ));
    setAdvLoad(false);
  };

  // ── Voice input ───────────────────────────────────────────
  const startVoice = useCallback(()=>{
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if(!SR){ setErr("Tu navegador no soporta voz. Usá Chrome o Safari."); return; }
    const rec = new SR();
    rec.lang = "es-AR"; rec.continuous = false; rec.interimResults = false;
    rec.onstart = ()=>{ setListening(true); setVoiceText(""); };
    rec.onresult = async(e)=>{
      const t = e.results[0][0].transcript;
      setVoiceText(t);
      setListening(false);
      setVoiceParsing(true);
      const parsed = await parseVoiceInput(t);
      setVoiceParsing(false);
      if(parsed){
        setForm(f=>({
          ...f,
          desc:   parsed.desc   || f.desc,
          monto:  parsed.monto  || f.monto,
          bucket: parsed.bucket || f.bucket,
          cat:    parsed.cat    || f.cat,
          pago:   parsed.pago   || f.pago,
          mhTipo: parsed.mhTipo || f.mhTipo,
        }));
        if(!showAdd) setShowAdd(true);
      } else { setErr("No pude parsear el gasto. Intentá de nuevo."); }
    };
    rec.onerror = ()=>{ setListening(false); setErr("Error de micrófono."); };
    rec.onend   = ()=>setListening(false);
    rec.start();
  },[showAdd]);

  // ── Derived data ──────────────────────────────────────────
  const all    = useMemo(()=>[...entries.personal,...entries.compartido,...entries.mh],[entries]);
  const sorted = useMemo(()=>[...all].sort((a,b)=>(b.fecha||"").localeCompare(a.fecha||"")),[all]);
  const stats  = useMemo(()=>buildStats(all),[all]);

  const movList = useMemo(()=>{
    let list = movFilter==="all" ? sorted : sorted.filter(e=>e.bucket===movFilter);
    if(movSearch.trim()){
      const q = movSearch.toLowerCase();
      list = list.filter(e=>
        e.desc?.toLowerCase().includes(q) ||
        e.cat?.toLowerCase().includes(q)  ||
        e.fecha?.includes(q)
      );
    }
    return list;
  },[sorted,movFilter,movSearch]);

  // Month comparison
  const thisM = today().slice(0,7);
  const prevM = prevMonth();
  const monthCompare = useMemo(()=>{
    const thisMoE  = all.filter(e=>monthOf(e)===thisM&&(e.sub==="gasto"||e.sub==="egreso"));
    const prevMoE  = all.filter(e=>monthOf(e)===prevM&&(e.sub==="gasto"||e.sub==="egreso"));
    const thisTotal = thisMoE.reduce((s,e)=>s+e.monto,0);
    const prevTotal = prevMoE.reduce((s,e)=>s+e.monto,0);
    const diff = thisTotal - prevTotal;
    const diffPct = prevTotal > 0 ? Math.round((diff/prevTotal)*100) : null;
    return { thisTotal, prevTotal, diff, diffPct };
  },[all,thisM,prevM]);

  // ── UI atoms ──────────────────────────────────────────────
  const Lbl = ({children,size=9,color=T.inkDim,mb=0,mt=0})=>(
    <div style={{fontSize:size,fontFamily:T.sans,fontWeight:600,letterSpacing:"0.08em",
      textTransform:"uppercase",color,marginBottom:mb,marginTop:mt}}>{children}</div>
  );

  const Rule = ({my=0})=>(
    <div style={{borderTop:`1px solid ${T.rule}`,margin:`${my}px 0`}}/>
  );

  const Chip = ({label,color=T.inkDim,bg=T.paper})=>(
    <span style={{fontSize:9,fontFamily:T.sans,fontWeight:600,letterSpacing:"0.05em",
      textTransform:"uppercase",padding:"2px 6px",background:bg,color,
      border:`1px solid ${T.rule}`,display:"inline-block"}}>
      {label}
    </span>
  );

  const Btn = ({onClick,children,primary,ghost,small,full,disabled,color})=>{
    const bg   = primary ? (color||T.ink) : T.cream;
    const cl   = primary ? T.cream        : (color||T.ink);
    const bd   = primary ? (color||T.ink) : T.rule;
    return (
      <button onClick={onClick} disabled={disabled} style={{
        display:"inline-flex",alignItems:"center",justifyContent:"center",
        gap:6,padding:small?"5px 12px":"9px 20px",width:full?"100%":"auto",
        background:bg,color:cl,border:`1.5px solid ${bd}`,
        fontSize:11,fontFamily:T.sans,fontWeight:600,letterSpacing:"0.05em",
        textTransform:"uppercase",opacity:disabled?0.4:1,
      }}>{children}</button>
    );
  };

  const EntryRow = ({e,showBucket=false})=>{
    const isPos = e.sub==="ingreso";
    const isAdj = e.sub==="ajuste";
    return (
      <div className={e._pending?"pending":""} style={{display:"flex",alignItems:"flex-start",gap:12,padding:"11px 0",
        borderBottom:`1px solid ${T.ruleL}`}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:14,fontFamily:T.sans,fontWeight:500,color:T.ink,
            overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginBottom:4}}>
            {e.desc}
          </div>
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
          <div className="num" style={{fontSize:15,fontWeight:500,color:isPos||isAdj?T.pos:T.ink}}>
            {isPos?"+":""}{ars(e.monto)}
          </div>
          {!e._pending&&e.notionId&&<a href={e.notionId} target="_blank" rel="noreferrer"
            style={{fontSize:9,color:T.inkDim,textDecoration:"none",fontFamily:T.mono,display:"block",marginTop:3}}>N ↗</a>}
        </div>
      </div>
    );
  };

  const ChartTip = ({active,payload,label})=>{
    if(!active||!payload?.length) return null;
    return (
      <div style={{background:T.cream,border:`1px solid ${T.rule}`,padding:"8px 12px"}}>
        <Lbl mb={6}>{label}</Lbl>
        {payload.map(p=>(
          <div key={p.name} style={{display:"flex",justifyContent:"space-between",gap:16,marginTop:3}}>
            <span style={{fontSize:10,color:T.inkMid,fontFamily:T.sans}}>{p.name}</span>
            <span className="num" style={{fontSize:11,color:T.ink}}>{ars(p.value)}</span>
          </div>
        ))}
      </div>
    );
  };

  // ── Layout shell ──────────────────────────────────────────
  // Responsive: sidebar on ≥720px, bottom bar on mobile
  const SIDEBAR_W = 180;
  const NAV_ITEMS = [
    ["home","Inicio"],["movimientos","Movimientos"],["analisis","Análisis"],["consejero","Asesor"],
  ];

  const NavSidebar = ()=>(
    <div style={{width:SIDEBAR_W,flexShrink:0,borderRight:`1.5px solid ${T.rule}`,
      display:"flex",flexDirection:"column",padding:"28px 0"}}>
      <div style={{padding:"0 24px 28px"}}>
        <div style={{fontFamily:T.disp,fontSize:22,fontWeight:700,color:T.ink,letterSpacing:"-0.03em"}}>MH</div>
        <div style={{fontSize:10,color:T.inkDim,marginTop:2,letterSpacing:"0.06em"}}>FINANZAS</div>
      </div>
      <Rule/>
      <div style={{paddingTop:20}}>
        {NAV_ITEMS.map(([k,l])=>(
          <button key={k} onClick={()=>setNav(k)} style={{
            display:"block",width:"100%",textAlign:"left",
            padding:"10px 24px",background:nav===k?T.accentL:"transparent",
            border:"none",borderLeft:`2.5px solid ${nav===k?T.accent:"transparent"}`,
            fontSize:12,fontFamily:T.sans,fontWeight:nav===k?600:400,
            color:nav===k?T.accent:T.inkMid,letterSpacing:"0.01em",
          }}>{l}</button>
        ))}
      </div>
      <div style={{marginTop:"auto",padding:"20px 24px 0",display:"flex",flexDirection:"column",gap:8}}>
        {syncing&&(
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <div style={{width:10,height:10,border:`1.5px solid ${T.rule}`,
              borderTopColor:T.accent,borderRadius:"50%"}} className="spin"/>
            <span style={{fontSize:9,color:T.inkDim,fontFamily:T.sans,
              letterSpacing:"0.06em",textTransform:"uppercase"}}>Sync…</span>
          </div>
        )}
        {lastSync&&!syncing&&(
          <div style={{fontSize:9,color:T.inkDim,fontFamily:T.mono}}>
            ↻ {lastSync.toLocaleTimeString("es-AR",{hour:"2-digit",minute:"2-digit"})}
          </div>
        )}
        <button onClick={()=>loadAll(true)} disabled={syncing}
          style={{background:"none",border:"none",fontSize:9,color:T.inkDim,
            fontFamily:T.sans,letterSpacing:"0.06em",textTransform:"uppercase",padding:0,textAlign:"left"}}>
          Recargar Notion
        </button>
      </div>
    </div>
  );

  const NavBottom = ()=>(
    <div style={{position:"fixed",bottom:0,left:0,right:0,background:T.cream,
      borderTop:`1.5px solid ${T.rule}`,display:"flex",zIndex:99}}>
      {NAV_ITEMS.map(([k,l])=>(
        <button key={k} onClick={()=>setNav(k)} style={{
          flex:1,padding:"11px 4px 9px",background:"none",border:"none",
          borderTop:`2px solid ${nav===k?T.accent:"transparent"}`,
          fontSize:9,fontFamily:T.sans,fontWeight:600,letterSpacing:"0.07em",
          color:nav===k?T.accent:T.inkDim,textTransform:"uppercase",
          position:"relative",
        }}>
          {l}
          {syncing&&k===nav&&(
            <div style={{position:"absolute",top:6,right:"calc(50% - 14px)",
              width:4,height:4,borderRadius:"50%",background:T.accent}}/>
          )}
        </button>
      ))}
    </div>
  );

  // ── Responsive wrapper ────────────────────────────────────
  const Shell = ({children})=>{
    const [wide,setWide] = useState(window.innerWidth>=720);
    useEffect(()=>{
      const h=()=>setWide(window.innerWidth>=720);
      window.addEventListener("resize",h); return ()=>window.removeEventListener("resize",h);
    },[]);
    return (
      <>
        <style>{CSS}</style>
        <div style={{minHeight:"100vh",background:T.cream,display:"flex",
          flexDirection:wide?"row":"column"}}>
          {wide&&<NavSidebar/>}
          <div style={{flex:1,minWidth:0,overflowY:"auto",paddingBottom:wide?0:56}}>
            {children}
            {/* Voice FAB */}
            <button onClick={startVoice} title="Cargar por voz"
              style={{
                position:"fixed", bottom:wide?80:120, right:28,
                width:40,height:40,
                background:listening?T.accent:T.paper,
                color:listening?T.cream:T.inkMid,
                border:`1.5px solid ${listening?T.accent:T.rule}`,
                borderRadius:"50%",fontSize:16,
                display:"flex",alignItems:"center",justifyContent:"center",
                boxShadow:"0 2px 8px rgba(0,0,0,0.12)",
                animation:listening?"voicePulse 0.8s ease-in-out infinite":undefined,
              }}>🎙</button>
            {/* Add FAB */}
            <button onClick={()=>setShowAdd(true)} title="Nuevo movimiento"
              style={{
                position:"fixed", bottom:wide?28:68, right:28,
                width:44,height:44,
                background:T.accent,color:T.cream,
                border:"none",fontSize:24,fontWeight:300,
                display:"flex",alignItems:"center",justifyContent:"center",
                boxShadow:"0 3px 14px rgba(184,92,42,0.35)",
              }}>+</button>
          </div>
          {!wide&&<NavBottom/>}
        </div>
      </>
    );
  };

  // ── Error banner ──────────────────────────────────────────
  const ErrBanner = ()=>err?(
    <div style={{margin:"0 20px 12px",padding:"9px 12px",background:T.negL,
      border:`1px solid ${T.neg}`,fontSize:11,color:T.neg,fontFamily:T.mono}}>
      {err}
    </div>
  ):null;

  // ── Add modal ─────────────────────────────────────────────
  const AddModal = ()=>{
    if(!showAdd) return null;
    const inpS={width:"100%",padding:"9px 10px",border:`1.5px solid ${T.rule}`,
                fontSize:14,color:T.ink,background:T.cream};
    const lbl={fontSize:9,fontFamily:T.sans,fontWeight:600,letterSpacing:"0.08em",
               textTransform:"uppercase",color:T.inkDim,display:"block",marginBottom:5};
    const onKey = e => { if(e.key==="Enter") handleAdd(); };
    return (
      <div style={{position:"fixed",inset:0,background:"rgba(26,25,23,0.5)",
        display:"flex",alignItems:"flex-start",justifyContent:"center",zIndex:200,
        paddingTop:40,overflowY:"auto"}}>
        <div className="fade" style={{background:T.cream,width:"100%",maxWidth:500,
          borderTop:`3px solid ${T.accent}`,margin:"0 16px"}}>
          {/* Modal header */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
            padding:"16px 20px",borderBottom:`1px solid ${T.rule}`}}>
            <div style={{fontFamily:T.disp,fontSize:17,fontWeight:700,color:T.ink}}>Nuevo movimiento</div>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <button onClick={startVoice} title="Dictar gasto"
                style={{width:32,height:32,background:listening?T.accent:T.paper,
                  color:listening?T.cream:T.inkMid,
                  border:`1px solid ${listening?T.accent:T.rule}`,
                  borderRadius:"50%",fontSize:14,display:"flex",
                  alignItems:"center",justifyContent:"center"}}>🎙</button>
              <button onClick={()=>setShowAdd(false)} style={{background:"none",border:"none",
                fontSize:20,color:T.inkDim,lineHeight:1}}>×</button>
            </div>
          </div>

          {/* Voice status */}
          {(listening||voiceParsing||voiceText)&&(
            <div style={{padding:"10px 20px",background:T.accentL,
              borderBottom:`1px solid ${T.rule}`,display:"flex",alignItems:"center",gap:8}}>
              {listening&&<>
                <div style={{width:8,height:8,borderRadius:"50%",background:T.accent}}
                  className="pulse"/>
                <span style={{fontSize:12,color:T.accent,fontFamily:T.sans}}>Escuchando…</span>
              </>}
              {voiceParsing&&<>
                <div style={{width:14,height:14,border:`1.5px solid ${T.rule}`,
                  borderTopColor:T.accent,borderRadius:"50%"}} className="spin"/>
                <span style={{fontSize:12,color:T.inkMid,fontFamily:T.sans}}>Procesando: "{voiceText}"</span>
              </>}
              {voiceText&&!listening&&!voiceParsing&&(
                <span style={{fontSize:11,color:T.inkMid,fontFamily:T.mono}}>
                  ✓ "{voiceText}"
                </span>
              )}
            </div>
          )}

          <div style={{padding:"20px",display:"flex",flexDirection:"column",gap:14}}>
            {/* Bucket */}
            <div>
              <span style={lbl}>Tipo</span>
              <div style={{display:"flex",border:`1.5px solid ${T.rule}`}}>
                {[["personal","Personal"],["compartido","Compartido"],["mh","MeinHaus"]].map(([k,l],i)=>(
                  <button key={k} onClick={()=>setForm(f=>({...f,bucket:k,cat:CATS[k][0]}))}
                    style={{flex:1,padding:"8px 4px",border:"none",
                      borderRight:i<2?`1px solid ${T.rule}`:"none",
                      background:form.bucket===k?T.ink:T.cream,
                      color:form.bucket===k?T.cream:T.inkMid,
                      fontSize:11,fontFamily:T.sans,fontWeight:600,letterSpacing:"0.04em"}}>
                    {l}
                  </button>
                ))}
              </div>
            </div>

            {/* Desc */}
            <div>
              <label style={lbl}>Descripción</label>
              <input style={{...inpS,outline:formErr&&!form.desc.trim()?`2px solid ${T.neg}`:"none"}}
                placeholder="ej: Ferretería San Martín" autoFocus
                value={form.desc} onChange={e=>setForm(f=>({...f,desc:e.target.value}))}
                onKeyDown={onKey}/>
            </div>

            {/* Monto + fecha */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <div>
                <label style={lbl}>Monto ($)</label>
                <input style={{...inpS,fontFamily:T.mono,
                  outline:formErr&&!(parseFloat(form.monto)>0)?`2px solid ${T.neg}`:"none"}}
                  type="number" placeholder="0"
                  value={form.monto} onChange={e=>setForm(f=>({...f,monto:e.target.value}))}
                  onKeyDown={onKey}/>
              </div>
              <div>
                <label style={lbl}>Fecha</label>
                <input style={{...inpS,fontFamily:T.mono,fontSize:12}} type="date"
                  value={form.fecha} onChange={e=>setForm(f=>({...f,fecha:e.target.value}))}/>
              </div>
            </div>

            {/* Contextual */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              {form.bucket==="compartido"&&(
                <div>
                  <label style={lbl}>Pagó</label>
                  <select style={inpS} value={form.pago} onChange={e=>setForm(f=>({...f,pago:e.target.value}))}>
                    <option>Mariano</option><option>Flor</option>
                  </select>
                </div>
              )}
              {form.bucket==="personal"&&(
                <div>
                  <label style={lbl}>Método</label>
                  <select style={inpS} value={form.metodo} onChange={e=>setForm(f=>({...f,metodo:e.target.value}))}>
                    {METODOS.map(m=><option key={m}>{m}</option>)}
                  </select>
                </div>
              )}
              {form.bucket==="mh"&&(
                <div>
                  <label style={lbl}>Tipo</label>
                  <select style={inpS} value={form.mhTipo} onChange={e=>setForm(f=>({...f,mhTipo:e.target.value}))}>
                    <option>Egreso</option><option>Ingreso</option>
                  </select>
                </div>
              )}
              <div>
                <label style={lbl}>Categoría</label>
                <select style={{...inpS,fontSize:12}} value={form.cat}
                  onChange={e=>setForm(f=>({...f,cat:e.target.value}))}>
                  {CATS[form.bucket].map(c=><option key={c}>{c}</option>)}
                </select>
              </div>
            </div>

            {formErr&&(
              <div style={{padding:"7px 10px",background:T.negL,border:`1px solid ${T.neg}`,
                fontSize:11,color:T.neg,fontFamily:T.sans}}>{formErr}</div>
            )}
            {err&&(
              <div style={{padding:"7px 10px",background:T.negL,border:`1px solid ${T.neg}`,
                fontSize:11,color:T.neg,fontFamily:T.mono}}>{err}</div>
            )}

            <div style={{display:"flex",gap:10,marginTop:4}}>
              <Btn onClick={()=>setShowAdd(false)}>Cancelar</Btn>
              <Btn primary full onClick={handleAdd} disabled={saving}>
                {saving?"Guardando en Notion…":"Guardar →"}
              </Btn>
            </div>
            <div style={{fontSize:9,color:T.inkDim,letterSpacing:"0.06em",
              textTransform:"uppercase",textAlign:"center"}}>
              Persiste directamente en Notion · {form.bucket.toUpperCase()}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ── Notion setup gate ────────────────────────────────────────
  if (!notionToken) return (
    <>
      <style>{CSS}</style>
      <SetupScreen onToken={(t) => {
        try { localStorage.setItem(NOTION_TOKEN_KEY, t); } catch {}
        setNotionToken(t);
      }}/>
    </>
  );

  // ═══════════════════════════════════════════════════════════
  // LOADING SCREEN
  // ═══════════════════════════════════════════════════════════
  if(loading) return (
    <>
      <style>{CSS}</style>
      <div style={{minHeight:"100vh",background:T.cream,display:"flex",
        flexDirection:"column",alignItems:"center",justifyContent:"center",gap:20}}>
        <div style={{fontFamily:T.disp,fontSize:52,fontWeight:700,color:T.ink,
          letterSpacing:"-0.04em"}}>MH</div>
        <div style={{width:22,height:22,border:`2px solid ${T.rule}`,
          borderTopColor:T.accent,borderRadius:"50%"}} className="spin"/>
        <div style={{fontSize:10,color:T.inkDim,letterSpacing:"0.12em",
          textTransform:"uppercase",fontFamily:T.sans}}>
          Cargando desde Notion
        </div>
      </div>
    </>
  );

  // ═══════════════════════════════════════════════════════════
  // HOME
  // ═══════════════════════════════════════════════════════════
  if(nav==="home") {
    const ahorroR = cfg.ingresoMensual>0
      ? pct(Math.max(0,cfg.ingresoMensual-stats.persEgr),cfg.ingresoMensual)
      : null;
    return (
      <Shell>
        <AddModal/>
        <div style={{padding:"28px 28px 20px",borderBottom:`1px solid ${T.rule}`}}>
          <div style={{fontSize:10,color:T.inkDim,fontFamily:T.sans,fontWeight:600,
            letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:8}}>
            {new Date().toLocaleDateString("es-AR",{weekday:"long",day:"numeric",month:"long"}).replace(/^\w/,c=>c.toUpperCase())}
          </div>
          <div style={{fontFamily:T.disp,fontSize:28,fontWeight:700,
            color:T.ink,letterSpacing:"-0.02em"}}>
            Finanzas MeinHaus
          </div>
        </div>

        {/* Totals grid */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",
          borderBottom:`1px solid ${T.rule}`}}>
          {[
            ["Personal",ars(stats.persEgr),T.ink],
            ["MeinHaus",signStr(stats.mhNeto),stats.mhNeto>=0?T.pos:T.neg],
            ["Compartido",ars(stats.tot),T.ink],
          ].map(([l,v,c],i)=>(
            <div key={l} style={{padding:"18px 20px",
              borderRight:i<2?`1px solid ${T.rule}`:"none"}}>
              <Lbl mb={8}>{l}</Lbl>
              <div className="num" style={{fontSize:18,fontWeight:500,color:c,
                overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{v}</div>
            </div>
          ))}
        </div>

        {/* Balance alert */}
        {stats.balOut>0&&(
          <div style={{padding:"14px 28px",background:T.accentL,
            borderBottom:`1px solid ${T.rule}`,
            display:"flex",justifyContent:"space-between",alignItems:"center",gap:16}}>
            {!settle ? (
              <>
                <div>
                  <Lbl color={T.accent} mb={5}>Balance pendiente</Lbl>
                  <div style={{display:"flex",alignItems:"baseline",gap:8}}>
                    <span className="num" style={{fontSize:22,color:T.accent,fontWeight:500}}>
                      {ars(stats.balOut)}
                    </span>
                    <span style={{fontSize:12,color:T.inkMid}}>
                      {stats.balDeb} → {stats.balCred}
                    </span>
                  </div>
                </div>
                <Btn small onClick={()=>setSettle(true)}>Saldar</Btn>
              </>
            ):(
              <div style={{width:"100%"}}>
                <Lbl color={T.accent} mb={8}>{stats.balDeb} transfiere {ars(stats.balOut)} a {stats.balCred}</Lbl>
                <div style={{display:"flex",gap:8}}>
                  <Btn small onClick={()=>setSettle(false)}>Cancelar</Btn>
                  <Btn small primary onClick={()=>handleSettle(stats)} disabled={saving}>
                    {saving?"…":"Confirmar →"}
                  </Btn>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Savings rate */}
        {ahorroR!==null&&(
          <div style={{padding:"14px 28px",borderBottom:`1px solid ${T.rule}`,
            display:"flex",justifyContent:"space-between",alignItems:"center",gap:16}}>
            <div>
              <Lbl mb={5}>Tasa de ahorro personal</Lbl>
              <div style={{display:"flex",alignItems:"baseline",gap:8}}>
                <span className="num" style={{fontSize:24,fontWeight:500,
                  color:ahorroR>=cfg.metaAhorro?T.pos:T.neg}}>{ahorroR}%</span>
                <span style={{fontSize:11,color:T.inkDim}}>meta {cfg.metaAhorro}%</span>
              </div>
            </div>
            <div style={{width:80,height:4,background:T.rule,position:"relative",flexShrink:0}}>
              <div style={{position:"absolute",left:0,top:0,bottom:0,
                width:`${Math.min(100,ahorroR)}%`,
                background:ahorroR>=cfg.metaAhorro?T.pos:T.accent,transition:"width 0.6s"}}/>
              <div style={{position:"absolute",left:`${Math.min(100,cfg.metaAhorro)}%`,
                top:-4,bottom:-4,width:2,background:T.inkDim}}/>
            </div>
          </div>
        )}

        {/* Month comparison */}
        {(monthCompare.thisTotal > 0 || monthCompare.prevTotal > 0) && (
          <div style={{padding:"14px 28px",borderBottom:`1px solid ${T.rule}`,
            display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}>
            <div style={{flex:1}}>
              <Lbl mb={8}>Este mes vs anterior</Lbl>
              <div style={{display:"flex",gap:20,alignItems:"baseline"}}>
                <div>
                  <div style={{fontSize:9,color:T.inkDim,fontFamily:T.mono,marginBottom:2}}>
                    {MESES[new Date().getMonth()]}
                  </div>
                  <div className="num" style={{fontSize:18,fontWeight:500,color:T.ink}}>
                    {ars(monthCompare.thisTotal)}
                  </div>
                </div>
                {monthCompare.prevTotal > 0 && (
                  <>
                    <div style={{color:T.rule,fontSize:16}}>→</div>
                    <div>
                      <div style={{fontSize:9,color:T.inkDim,fontFamily:T.mono,marginBottom:2}}>
                        {MESES[new Date(prevM+"-01").getMonth()]}
                      </div>
                      <div className="num" style={{fontSize:14,color:T.inkMid}}>
                        {ars(monthCompare.prevTotal)}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
            {monthCompare.diffPct !== null && (
              <div style={{padding:"8px 12px",
                background:monthCompare.diff>0?T.negL:T.posL,
                border:`1px solid ${monthCompare.diff>0?T.neg:T.pos}`}}>
                <div className="num" style={{fontSize:18,fontWeight:600,
                  color:monthCompare.diff>0?T.neg:T.pos}}>
                  {monthCompare.diff>0?"+":""}{monthCompare.diffPct}%
                </div>
              </div>
            )}
          </div>
        )}

        {/* Recent */}
        <div style={{padding:"20px 28px"}}>
          <div style={{display:"flex",justifyContent:"space-between",
            alignItems:"center",marginBottom:14}}>
            <Lbl>Últimos movimientos</Lbl>
            <button onClick={()=>setNav("movimientos")} style={{background:"none",border:"none",
              fontSize:10,color:T.accent,fontFamily:T.sans,fontWeight:600,
              letterSpacing:"0.06em",textTransform:"uppercase"}}>
              Ver todo →
            </button>
          </div>
          {sorted.slice(0,8).map((e,i)=><EntryRow key={e.notionId||i} e={e} showBucket/>)}
          {sorted.length===0&&(
            <div style={{padding:"28px 0",color:T.inkDim,fontSize:13,
              fontFamily:T.sans,textAlign:"center"}}>
              Sin movimientos. Empezá a cargar con el botón +
            </div>
          )}
        </div>
      </Shell>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // MOVIMIENTOS
  // ═══════════════════════════════════════════════════════════
  if(nav==="movimientos") return (
    <Shell>
      <AddModal/>
      <div style={{padding:"24px 28px 16px",borderBottom:`1px solid ${T.rule}`}}>
        <div style={{fontFamily:T.disp,fontSize:22,fontWeight:700,color:T.ink,marginBottom:4}}>Movimientos</div>
        <div style={{fontSize:11,color:T.inkDim}}>{all.length} registros · Notion</div>
      </div>
      {/* Filter tabs */}
      <div style={{display:"flex",borderBottom:`1px solid ${T.rule}`}}>
        {[["all","Todos"],["personal","Personal"],["compartido","Compartido"],["mh","MeinHaus"]].map(([k,l])=>(
          <button key={k} onClick={()=>setMovFilter(k)} style={{
            flex:1,padding:"10px 8px",background:"none",border:"none",
            borderBottom:`2px solid ${movFilter===k?T.accent:"transparent"}`,
            fontSize:10,fontFamily:T.sans,fontWeight:600,letterSpacing:"0.06em",
            color:movFilter===k?T.accent:T.inkDim,textTransform:"uppercase",
          }}>{l}</button>
        ))}
      </div>
      {/* Search */}
      <div style={{padding:"10px 20px",borderBottom:`1px solid ${T.ruleL}`}}>
        <input
          style={{width:"100%",padding:"7px 10px",border:`1px solid ${T.rule}`,
            background:T.paper,fontSize:13,color:T.ink,fontFamily:T.sans}}
          placeholder="Buscar por descripción, categoría o fecha…"
          value={movSearch}
          onChange={e=>setMovSearch(e.target.value)}
        />
      </div>
      <ErrBanner/>
      <div style={{padding:"0 28px"}}>
        {movSearch&&<div style={{padding:"8px 0",fontSize:10,color:T.inkDim,fontFamily:T.mono}}>
          {movList.length} resultado{movList.length!==1?"s":""} para "{movSearch}"
        </div>}
        {movList.length===0
          ? <div style={{padding:"40px 0",textAlign:"center",color:T.inkDim,fontSize:13}}>
              Sin movimientos
            </div>
          : movList.map((e,i)=><EntryRow key={e.notionId||i} e={e} showBucket={movFilter==="all"}/>)
        }
      </div>
    </Shell>
  );

  // ═══════════════════════════════════════════════════════════
  // ANÁLISIS
  // ═══════════════════════════════════════════════════════════
  if(nav==="analisis") {
    const inpS={width:"100%",padding:"8px 10px",border:`1.5px solid ${T.rule}`,
                fontSize:13,color:T.ink,background:T.cream,fontFamily:T.mono};
    const lbl={fontSize:9,fontFamily:T.sans,fontWeight:600,letterSpacing:"0.08em",
               textTransform:"uppercase",color:T.inkDim,display:"block",marginBottom:5};
    const spent  = stats.persEgr;
    const left   = Math.max(0,cfg.ingresoMensual-spent);
    const ahorroR= cfg.ingresoMensual>0?pct(left,cfg.ingresoMensual):null;
    return (
      <Shell>
        <AddModal/>
        <div style={{padding:"24px 28px 20px",borderBottom:`1px solid ${T.rule}`}}>
          <div style={{fontFamily:T.disp,fontSize:22,fontWeight:700,color:T.ink}}>Análisis</div>
        </div>
        <div style={{padding:"24px 28px",display:"flex",flexDirection:"column",gap:24}}>

          {/* Config */}
          <div style={{padding:"16px",background:T.paper,border:`1px solid ${T.rule}`}}>
            <Lbl mb={14}>Parámetros personales</Lbl>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <div><label style={lbl}>Ingreso mensual ($)</label>
                <input style={inpS} type="number" placeholder="0"
                  value={cfg.ingresoMensual||""} onChange={e=>saveCfg({...cfg,ingresoMensual:Number(e.target.value)||0})}/>
              </div>
              <div><label style={lbl}>Meta ahorro (%)</label>
                <input style={inpS} type="number" placeholder="20"
                  value={cfg.metaAhorro||""} onChange={e=>saveCfg({...cfg,metaAhorro:Number(e.target.value)||20})}/>
              </div>
            </div>
            {cfg.ingresoMensual>0&&(
              <div style={{marginTop:14,paddingTop:14,borderTop:`1px solid ${T.rule}`,
                display:"flex",gap:0,border:`1px solid ${T.rule}`}}>
                {[
                  ["Gastado",ars(spent),spent>cfg.ingresoMensual?T.neg:T.ink],
                  ["Disponible",ars(left),T.pos],
                  ["Ahorro",`${ahorroR}%`,ahorroR>=cfg.metaAhorro?T.pos:T.neg],
                ].map(([l,v,c],i)=>(
                  <div key={l} style={{flex:1,padding:"10px 14px",
                    borderRight:i<2?`1px solid ${T.rule}`:"none"}}>
                    <Lbl mb={5}>{l}</Lbl>
                    <div className="num" style={{fontSize:15,color:c,fontWeight:500}}>{v}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Monthly chart */}
          {stats.months.length>0&&(
            <div>
              <Lbl mb={16}>Flujo mensual</Lbl>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={stats.months} barCategoryGap="28%">
                  <XAxis dataKey="label" tick={{fill:T.inkDim,fontSize:9,fontFamily:T.sans,fontWeight:600}} axisLine={{stroke:T.rule}} tickLine={false}/>
                  <YAxis tick={{fill:T.inkDim,fontSize:8,fontFamily:T.mono}} axisLine={false} tickLine={false}
                    tickFormatter={v=>"$"+Math.round(v/1000)+"k"}/>
                  <Tooltip content={<ChartTip/>}/>
                  <Bar dataKey="persEgr" fill={T.inkMid}  name="Personal"    radius={[1,1,0,0]} barSize={9}/>
                  <Bar dataKey="mhEgr"   fill={T.ink}     name="MH Egresos"  radius={[1,1,0,0]} barSize={9}/>
                  <Bar dataKey="mhIng"   fill={T.accent}  name="MH Ingresos" radius={[1,1,0,0]} barSize={9}/>
                </BarChart>
              </ResponsiveContainer>
              <div style={{display:"flex",gap:16,marginTop:8}}>
                {[[T.inkMid,"Personal"],[T.ink,"MH Egr."],[T.accent,"MH Ing."]].map(([c,l])=>(
                  <div key={l} style={{display:"flex",alignItems:"center",gap:5}}>
                    <div style={{width:10,height:2,background:c}}/>
                    <span style={{fontSize:9,color:T.inkDim,fontFamily:T.sans,fontWeight:600,
                      letterSpacing:"0.06em",textTransform:"uppercase"}}>{l}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Rule/>

          {/* MH metrics */}
          <div>
            <Lbl mb={14}>MeinHaus — flujo</Lbl>
            <div style={{display:"flex",border:`1px solid ${T.rule}`}}>
              {[
                ["Ingresos",  ars(stats.mhIng),  T.pos],
                ["Egresos",   ars(stats.mhEgr),  T.neg],
                ["Neto",      signStr(stats.mhNeto), stats.mhNeto>=0?T.pos:T.neg],
                ...(stats.mhIng>0?[["Margen",`${pct(stats.mhNeto,stats.mhIng)}%`,stats.mhNeto>=0?T.pos:T.neg]]:[]),
              ].map(([l,v,c],i,arr)=>(
                <div key={l} style={{flex:1,padding:"12px 14px",
                  borderRight:i<arr.length-1?`1px solid ${T.rule}`:"none"}}>
                  <Lbl mb={5}>{l}</Lbl>
                  <div className="num" style={{fontSize:13,fontWeight:500,color:c}}>{v}</div>
                </div>
              ))}
            </div>
          </div>

          {/* MH by category */}
          {stats.mhCatData.length>0&&(
            <div>
              <Lbl mb={14}>MeinHaus — egresos por rubro</Lbl>
              {stats.mhCatData.map((d,i)=>{
                const max=stats.mhCatData[0]?.value||1;
                return (
                  <div key={d.name} style={{marginBottom:10}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                      <span style={{fontSize:12,color:T.inkMid,fontFamily:T.sans}}>{d.name}</span>
                      <span className="num" style={{fontSize:12,color:T.ink}}>{ars(d.value)}</span>
                    </div>
                    <div style={{height:2,background:T.rule}}>
                      <div style={{height:"100%",background:i===0?T.ink:T.inkMid,
                        width:`${pct(d.value,max)}%`,transition:"width 0.5s"}}/>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Personal by category */}
          {stats.catData.length>0&&(
            <>
              <Rule/>
              <div>
                <Lbl mb={14}>Personal — gasto por categoría</Lbl>
                <div style={{display:"flex",gap:16,alignItems:"center"}}>
                  <PieChart width={100} height={100}>
                    <Pie data={stats.catData} cx={46} cy={46} innerRadius={26} outerRadius={46}
                      dataKey="value" paddingAngle={2} startAngle={90} endAngle={-270}>
                      {stats.catData.map((_,i)=><Cell key={i} fill={CAT_COLORS[i%CAT_COLORS.length]}/>)}
                    </Pie>
                  </PieChart>
                  <div style={{flex:1,display:"flex",flexDirection:"column",gap:6}}>
                    {stats.catData.slice(0,7).map((d,i)=>(
                      <div key={d.name} style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <div style={{display:"flex",alignItems:"center",gap:6}}>
                          <div style={{width:6,height:6,background:CAT_COLORS[i%CAT_COLORS.length]}}/>
                          <span style={{fontSize:10,color:T.inkMid,fontFamily:T.sans}}>{d.name}</span>
                        </div>
                        <span className="num" style={{fontSize:10,color:T.ink}}>{ars(d.value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

          {stats.catData.length===0&&stats.mhCatData.length===0&&stats.months.length===0&&(
            <div style={{textAlign:"center",padding:"40px 0",color:T.inkDim,fontSize:13,fontFamily:T.sans}}>
              Cargá movimientos para ver el análisis.
            </div>
          )}
        </div>
      </Shell>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // CONSEJERO
  // ═══════════════════════════════════════════════════════════
  if(nav==="consejero") return (
    <Shell>
      <AddModal/>
      <div style={{padding:"24px 28px 20px",borderBottom:`1px solid ${T.rule}`}}>
        <div style={{fontFamily:T.disp,fontSize:22,fontWeight:700,color:T.ink}}>Asesor</div>
        <div style={{fontSize:11,color:T.inkDim,marginTop:3}}>Análisis con IA · datos reales de Notion</div>
      </div>
      <div style={{padding:"24px 28px",display:"flex",flexDirection:"column",gap:16}}>
        {/* Snapshot */}
        <div style={{display:"flex",border:`1px solid ${T.rule}`}}>
          {[
            ["Personal",     ars(stats.persEgr),         T.ink],
            ["MH neto",      signStr(stats.mhNeto),       stats.mhNeto>=0?T.pos:T.neg],
            ["Compartido",   stats.balOut>0?ars(stats.balOut):"Al día", stats.balOut>0?T.accent:T.pos],
          ].map(([l,v,c],i)=>(
            <div key={l} style={{flex:1,padding:"12px 14px",
              borderRight:i<2?`1px solid ${T.rule}`:"none"}}>
              <Lbl mb={5}>{l}</Lbl>
              <div className="num" style={{fontSize:14,color:c,fontWeight:500}}>{v}</div>
            </div>
          ))}
        </div>

        <Btn primary full onClick={()=>getAdvice(stats)} disabled={advLoad}>
          {advLoad?"Analizando…":"Analizar mis finanzas →"}
        </Btn>

        {advice&&(
          <div className="fade" style={{padding:"18px 20px",background:T.paper,
            borderLeft:`3px solid ${T.accent}`,border:`1px solid ${T.rule}`,
            borderLeft:`3px solid ${T.accent}`}}>
            <Lbl color={T.accent} mb={12}>Análisis</Lbl>
            <div style={{fontSize:13,color:T.ink,lineHeight:1.8,fontFamily:T.sans,
              whiteSpace:"pre-wrap"}}>{advice}</div>
          </div>
        )}

        {cfg.ingresoMensual===0&&(
          <div style={{padding:"14px 16px",background:T.accentL,border:`1px solid ${T.accent}`}}>
            <Lbl color={T.accent} mb={6}>Sin ingreso configurado</Lbl>
            <div style={{fontSize:12,color:T.inkMid,lineHeight:1.6,marginBottom:10,fontFamily:T.sans}}>
              Sin ingreso mensual no puedo calcular tu tasa de ahorro real. Configuralo en Análisis.
            </div>
            <Btn small onClick={()=>setNav("analisis")}>Ir a Análisis →</Btn>
          </div>
        )}
      </div>
    </Shell>
  );

  return null;
}
