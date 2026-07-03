import { getStore } from "@netlify/blobs";

export default async (req) => {
  if (req.method !== "GET") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    const store = getStore({ name: "testimonials", consistency: "strong" });
    const { blobs } = await store.list({ prefix: "approved/" });

    const testimonials = await Promise.all(
      blobs.map(({ key }) => store.get(key, { type: "json" }))
    );

    const sorted = testimonials
      .filter(Boolean)
      .sort((a, b) => new Date(a.approvedAt) - new Date(b.approvedAt));

    return new Response(JSON.stringify(sorted), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=60",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    console.error("get-testimonials error:", err);
    return new Response(JSON.stringify([]), {
      headers: { "Content-Type": "application/json" },
    });
  }
};

export const config = { path: "/.netlify/functions/get-testimonials" };
