const NOTION_API = "https://api.notion.com/v1";
const NOTION_VER = "2022-06-28";

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-notion-token");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
}

function parseProps(page, type) {
  const p = page.properties;
  const id = page.url || `https://notion.so/${(page.id||"").replace(/-/g,"")}`;
  const fecha = p.Fecha?.date?.start || null;
  if (type === "personal") return { notionId:id, fecha,
    desc:   p["Descripción"]?.title?.[0]?.plain_text || "",
    monto:  p.Monto?.number || 0,
    cat:    p["Categoría"]?.select?.name || "Otros",
    metodo: p["Método de pago"]?.select?.name || null };
  if (type === "compartido") return { notionId:id, fecha,
    desc:   p["Descripción"]?.title?.[0]?.plain_text || "",
    monto:  p.Monto?.number || 0,
    pago:   p["Pagó"]?.select?.name || "Mariano",
    cat:    p["Categoría"]?.select?.name || "Vivienda",
    estado: p.Estado?.select?.name || "Pendiente" };
  if (type === "mh") return { notionId:id, fecha,
    desc:  p.Movimiento?.title?.[0]?.plain_text || "",
    monto: p.Monto?.number || 0,
    tipo:  p.Tipo?.select?.name || "Egreso",
    cat:   p["Categoría"]?.multi_select?.[0]?.name || "Varios" };
  return { notionId:id, fecha };
}

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

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")    return res.status(405).json({ error:"Method not allowed" });

  const action = req.query.action;
  const notionToken = req.headers["x-notion-token"] || process.env.NOTION_TOKEN;
  const body = req.body || {};

  try {
    if (action === "query") {
      if (!notionToken) return res.status(401).json({ error:"No Notion token" });
      const d = await notionReq("POST", `/databases/${body.dbId}/query`, notionToken,
        { sorts:[{property:"Fecha",direction:"descending"}], page_size:100 });
      return res.json((d.results||[]).map(p => parseProps(p, body.type)));
    }

    if (action === "create") {
      if (!notionToken) return res.status(401).json({ error:"No Notion token" });
      const d = await notionReq("POST", "/pages", notionToken,
        { parent:{ database_id:body.dbId }, properties:body.properties });
      return res.json({ success:true, notionId: d.url || `https://notion.so/${(d.id||"").replace(/-/g,"")}` });
    }

    if (action === "claude") {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST",
        headers:{ "Content-Type":"application/json", "x-api-key":process.env.ANTHROPIC_API_KEY, "anthropic-version":"2023-06-01" },
        body: JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:body.max_tokens||1200, system:body.system, messages:body.messages }),
      });
      return res.json(await r.json());
    }

    return res.status(400).json({ error:`Unknown action: ${action}` });
  } catch(e) {
    return res.status(500).json({ error: String(e) });
  }
}
