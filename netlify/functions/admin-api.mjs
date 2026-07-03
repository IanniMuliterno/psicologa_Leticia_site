import { getStore } from "@netlify/blobs";

function denied() {
  return new Response(JSON.stringify({ error: "Não autorizado." }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export default async (req) => {
  const secret = process.env.ADMIN_SECRET;
  if (!secret || req.headers.get("Authorization") !== `Bearer ${secret}`) {
    return denied();
  }

  const store = getStore({ name: "testimonials", consistency: "strong" });

  if (req.method === "GET") {
    try {
      const [{ blobs: pendingBlobs }, { blobs: approvedBlobs }] = await Promise.all([
        store.list({ prefix: "pending/" }),
        store.list({ prefix: "approved/" }),
      ]);

      const [pending, approved] = await Promise.all([
        Promise.all(pendingBlobs.map(({ key }) => store.get(key, { type: "json" }))),
        Promise.all(approvedBlobs.map(({ key }) => store.get(key, { type: "json" }))),
      ]);

      return jsonResponse({
        pending: pending
          .filter(Boolean)
          .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt)),
        approved: approved
          .filter(Boolean)
          .sort((a, b) => new Date(b.approvedAt) - new Date(a.approvedAt)),
      });
    } catch (err) {
      console.error("admin-api list error:", err);
      return jsonResponse({ error: "Erro ao listar depoimentos." }, 500);
    }
  }

  if (req.method === "POST") {
    let body;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Requisição inválida." }, 400);
    }

    const { action, id } = body;

    if (!id || !["approve", "reject"].includes(action)) {
      return jsonResponse({ error: "Parâmetros inválidos." }, 400);
    }

    const pendingKey = `pending/${id}`;

    try {
      const entry = await store.get(pendingKey, { type: "json" });

      if (!entry) {
        return jsonResponse({ error: "Depoimento não encontrado." }, 404);
      }

      if (action === "approve") {
        await store.setJSON(`approved/${id}`, {
          ...entry,
          approvedAt: new Date().toISOString(),
        });
      }

      await store.delete(pendingKey);

      return jsonResponse({ success: true });
    } catch (err) {
      console.error("admin-api action error:", err);
      return jsonResponse({ error: "Erro ao processar ação." }, 500);
    }
  }

  return new Response("Method Not Allowed", { status: 405 });
};

export const config = { path: "/.netlify/functions/admin-api" };
