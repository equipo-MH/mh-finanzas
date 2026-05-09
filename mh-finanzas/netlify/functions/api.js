const NOTION_API = "https://api.notion.com/v1";
const NOTION_VER = "2022-06-28";

const CORS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, x-notion-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function notionReq(method, path, token, body) {
  const r = await fetch(`${NOTION_API}${path}`, {
    method,
    headers: { Authorization:`Bearer ${token}`, "Notion-Version":NOTION_VER, "Content-Type":"application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.message || `Notion ${r.status}`);
  return d;
}

function parseProps(page, type) {
  const p = page.properties;
  const id = page.url || `https://notion.so/${(page.id||"").replace(/-/g,"")}`;
  const fecha = p.Fecha?.date?.start || null;
  if(type==="personal") return { notionId:id, fecha,
    desc:   p["Descripción"]?.title?.[0]?.plain_text||"",
    monto:  p.Monto?.number||0,
    cat:    p["Categoría"]?.select?.name||"Otros",
    metodo: p["Método de pago"]?.select?.name||null };
  if(type==="compartido") return { notionId:id, fecha,
    desc:   p["Descripción"]?.title?.[0]?.plain_text||"",
    monto:  p.Monto?.number||0,
    pago:   p["Pagó"]?.select?.name||"Mariano",
    cat:    p["Categoría"]?.select?.name||"Vivienda",
    estado: p.Estado?.select?.name||"Pendiente" };
  if(type==="mh") return { notionId:id, fecha,
    desc:  p.Movimiento?.title?.[0]?.plain_text||"",
    monto: p.Monto?.number||0,
    tipo:  p.Tipo?.select?.name||"Egreso",
    cat:   p["Categoría"]?.multi_select?.[0]?.name||"Varios" };
  if(type==="cuota") return { notionId:id,
    desc:         p["Descripción"]?.title?.[0]?.plain_text||"",
    montoCuota:   p["Monto cuota"]?.number||0,
    cuotaN:       p["Cuota N°"]?.number||0,
    totalCuotas:  p["Total cuotas"]?.number||0,
    tarjeta:      p["Tarjeta"]?.select?.name||"",
    fechaCompra:  p["Fecha compra"]?.date?.start||null,
    mesDebito:    p["Mes débito"]?.date?.start||null,
    estado:       p["Estado"]?.select?.name||"Pendiente",
    grupoId:      p["Grupo ID"]?.rich_text?.[0]?.plain_text||"",
    descOriginal: p["Descripción original"]?.rich_text?.[0]?.plain_text||"" };
  if(type==="colaborador") return { notionId:id,
    nombre:       p["Colaborador"]?.title?.[0]?.plain_text||"",
    especialidad: (p["Rol"]?.multi_select?.[0]?.name) || (p["Area"]?.multi_select?.[0]?.name) || "",
    estado:       p["Estado"]?.select?.name||"Activo",
    contacto:     "" };
  if(type==="honorario") return { notionId:id,
    desc:           p["Descripción"]?.title?.[0]?.plain_text||"",
    colaborador:    p["Colaborador"]?.rich_text?.[0]?.plain_text||"",
    proyecto:       p["Proyecto"]?.rich_text?.[0]?.plain_text||"",
    montoPactado:   p["Monto pactado"]?.number||0,
    totalAdelantado:p["Total adelantado"]?.number||0,
    estado:         p["Estado"]?.select?.name||"En curso",
    notas:          p["Notas"]?.rich_text?.[0]?.plain_text||"",
    fechaInicio:    p["Fecha inicio"]?.date?.start||null };
  if(type==="pagoColab") return { notionId:id,
    desc:        p["Descripción"]?.title?.[0]?.plain_text||"",
    colaborador: p["Colaborador"]?.rich_text?.[0]?.plain_text||"",
    proyecto:    p["Proyecto"]?.rich_text?.[0]?.plain_text||"",
    monto:       p["Monto"]?.number||0,
    tipo:        p["Tipo"]?.select?.name||"Adelanto",
    metodo:      p["Método"]?.select?.name||"Transferencia",
    fecha:       p["Fecha"]?.date?.start||null };
  return { notionId:id };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode:200, headers:CORS, body:"" };
  if (event.httpMethod !== "POST")    return { statusCode:405, headers:CORS, body:"Method Not Allowed" };

  const action      = event.queryStringParameters?.action;
  const notionToken = event.headers["x-notion-token"] || process.env.NOTION_TOKEN;
  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch {}

  try {
    if (action === "query") {
      if (!notionToken) return { statusCode:401, headers:CORS, body:JSON.stringify({error:"No Notion token"}) };
      const queryBody = { sorts:[{timestamp:"created_time",direction:"descending"}], page_size:100 };
      // Filter activos for colaboradores
      if (body.type === "colaborador") {
        queryBody.filter = { property:"Estado", select:{ equals:"Activo" } };
      }
      const d = await notionReq("POST", `/databases/${body.dbId}/query`, notionToken, queryBody);
      return { statusCode:200, headers:CORS, body:JSON.stringify((d.results||[]).map(p=>parseProps(p,body.type))) };
    }

    if (action === "create") {
      if (!notionToken) return { statusCode:401, headers:CORS, body:JSON.stringify({error:"No Notion token"}) };
      const d = await notionReq("POST", "/pages", notionToken,
        { parent:{database_id:body.dbId}, properties:body.properties });
      return { statusCode:200, headers:CORS, body:JSON.stringify({success:true, notionId:d.url||`https://notion.so/${(d.id||"").replace(/-/g,"")}`}) };
    }

    if (action === "update") {
      if (!notionToken) return { statusCode:401, headers:CORS, body:JSON.stringify({error:"No Notion token"}) };
      // Extract page ID from URL
      let pageId = body.pageId;
      if (pageId && pageId.includes("notion.so/")) {
        pageId = pageId.split("/").pop().replace(/-/g,"");
        // Format as UUID
        pageId = pageId.replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, "$1-$2-$3-$4-$5");
      }
      const d = await notionReq("PATCH", `/pages/${pageId}`, notionToken, { properties:body.properties });
      return { statusCode:200, headers:CORS, body:JSON.stringify({success:true}) };
    }

    if (action === "claude") {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST",
        headers:{"Content-Type":"application/json","x-api-key":process.env.ANTHROPIC_API_KEY,"anthropic-version":"2023-06-01"},
        body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:body.max_tokens||1200,system:body.system,messages:body.messages}),
      });
      return { statusCode:200, headers:CORS, body:JSON.stringify(await r.json()) };
    }

    return { statusCode:400, headers:CORS, body:JSON.stringify({error:`Unknown action: ${action}`}) };
  } catch(e) {
    return { statusCode:500, headers:CORS, body:JSON.stringify({error:String(e)}) };
  }
};
