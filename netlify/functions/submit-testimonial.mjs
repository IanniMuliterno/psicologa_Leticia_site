import { getStore } from "@netlify/blobs";
import { randomUUID } from "crypto";

const MAX_NAME = 60;
const MAX_TEXT = 1000;
const MAX_DETAIL = 80;

export default async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Requisição inválida." }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const { name, text, detail, hp, stars } = body;

  // Honeypot: bots fill this field; real users don't see it
  if (hp) {
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!name?.trim()) {
    return new Response(
      JSON.stringify({ error: "Por favor, informe seu nome." }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  if (!text?.trim() || text.trim().length < 20) {
    return new Response(
      JSON.stringify({ error: "O depoimento deve ter pelo menos 20 caracteres." }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const entry = {
    id: randomUUID(),
    name: name.trim().slice(0, MAX_NAME),
    detail: (detail || "").trim().slice(0, MAX_DETAIL),
    text: text.trim().slice(0, MAX_TEXT),
    stars: Math.min(5, Math.max(1, parseInt(stars, 10) || 5)),
    submittedAt: new Date().toISOString(),
  };

  try {
    const store = getStore({ name: "testimonials", consistency: "strong" });
    await store.setJSON(`pending/${entry.id}`, entry);
  } catch (err) {
    console.error("submit-testimonial blob error:", err);
    return new Response(
      JSON.stringify({ error: "Erro ao salvar depoimento. Tente novamente." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  // Best-effort email notification via Web3Forms (optional)
  const web3Key = process.env.WEB3FORMS_KEY;
  if (web3Key) {
    fetch("https://api.web3forms.com/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        access_key: web3Key,
        subject: "Novo depoimento pendente de aprovação",
        from_name: "Site Letícia Oliveira",
        message: `De: ${entry.name}\n${entry.detail ? `(${entry.detail})\n` : ""}\n${entry.text}\n\nAcesse o painel para aprovar: https://psicologaleticiaoliveira.netlify.app/admin/`,
      }),
    }).catch(() => {});
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

export const config = { path: "/.netlify/functions/submit-testimonial" };
