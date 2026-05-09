const NOTION_API = "https://api.notion.com/v1";
const NOTION_VER = "2022-06-28";

const CORS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, x-notion-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function notionReq(method, path, token, body) {
  const res = await fetch(`${NOTION_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_VER,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || `Notion error ${res.status}`);
  return data;
}

function parseProps(page, type) {
  const p = page.properties;
  const id = page.url || `https://notion.so/${(page.id||"").replace(/-/g,"")}`;
  const fecha = p.Fecha?.date?.start || null;
  if (type === "personal") return { notionId:id, fecha,
    desc:   p["Descripción"]?.title?.[0]?.plain_text || "",
    monto:  p.Monto?.number || 0,
    cat:    p["Categoría"]?.select?.name || "Otros",
    metodo: p["Método de pago"]?.select?.name || null,
  };
  if (type === "compartido") return { notionId:id, fecha,
    desc:   p["Descripción"]?.title?.[0]?.plain_text || "",
    monto:  p.Monto?.number || 0,
    pago:   p["Pagó"]?.select?.name || "Mariano",
    cat:    p["Categoría"]?.select?.name || "Vivienda",
    estado: p.Estado?.select?.name || "Pendiente",
  };
  if (type === "mh") return { notionId:id, fecha,
    desc:  p.Movimiento?.title?.[0]?.plain_text || "",
    monto: p.Monto?.number || 0,
    tipo:  p.Tipo?.select?.name || "Egreso",
    cat:   p["Categoría"]?.multi_select?.[0]?.name || "Varios",
  };
  return { notionId:id, fecha };
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
      const data = await notionReq("POST", `/databases/${body.dbId}/query`, notionToken, {
        sorts:[{property:"Fecha",direction:"descending"}], page_size:100,
      });
      return { statusCode:200, headers:CORS, body:JSON.stringify((data.results||[]).map(p=>parseProps(p,body.type))) };
    }

    if (action === "create") {
      if (!notionToken) return { statusCode:401, headers:CORS, body:JSON.stringify({error:"No Notion token"}) };
      const data = await notionReq("POST", "/pages", notionToken, {
        parent:{database_id:body.dbId}, properties:body.properties,
      });
      return { statusCode:200, headers:CORS, body:JSON.stringify({
        success:true, notionId:data.url||`https://notion.so/${(data.id||"").replace(/-/g,"")}`
      })};
    }

    if (action === "claude") {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST",
        headers:{ "Content-Type":"application/json", "x-api-key":process.env.ANTHROPIC_API_KEY, "anthropic-version":"2023-06-01" },
        body:JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:body.max_tokens||1200, system:body.system, messages:body.messages }),
      });
      return { statusCode:200, headers:CORS, body:JSON.stringify(await res.json()) };
    }

    return { statusCode:400, headers:CORS, body:JSON.stringify({error:`Unknown action: ${action}`}) };
  } catch(e) {
    return { statusCode:500, headers:CORS, body:JSON.stringify({error:String(e)}) };
  }
};
