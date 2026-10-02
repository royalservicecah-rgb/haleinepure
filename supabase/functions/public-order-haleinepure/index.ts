import { createClient } from "npm:@supabase/supabase-js@2";

const STORE = "destockage-haleine";
const PROMO_END = Date.parse("2026-10-02T18:45:00Z");
const PROD = "https://haleinepure.destockagerapide.com";

function allowedOrigin(origin: string | null) {
  return origin === null || origin === PROD;
}

function cors(origin: string | null) {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Vary": "Origin",
  };
  if (allowedOrigin(origin)) headers["Access-Control-Allow-Origin"] = origin || PROD;
  return headers;
}

function reply(origin: string | null, body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(origin), "Content-Type": "application/json" },
  });
}

function clean(v: unknown, n = 180) {
  return String(v || "").trim().slice(0, n);
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");

  if (!allowedOrigin(origin)) {
    return reply(origin, { error: "origin_not_allowed" }, 403);
  }
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors(origin) });
  }
  if (req.method === "GET") {
    try {
      const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const { count, error } = await sb.from("orders").select("id", { count: "exact", head: true })
        .eq("product_sku", "haleine-lao-li-shi-50g").eq("source_domain", "haleinepure.destockagerapide.com")
        .eq("status", "delivered").not("customer_name", "ilike", "%test%")
        .not("customer_name", "ilike", "%qa%").not("customer_name", "ilike", "%demo%").not("customer_name", "ilike", "%démo%");
      if (error) return reply(origin, { error: "stats_unavailable" }, 503);
      const now = Date.now();
      const { data: recent, error: recentError } = await sb.from("orders").select("created_at")
        .eq("product_sku", "haleine-lao-li-shi-50g").eq("source_domain", "haleinepure.destockagerapide.com")
        .in("status", ["new", "confirmed", "delivered", "in_delivery", "preparing"])
        .not("customer_name", "ilike", "%test%").not("customer_name", "ilike", "%qa%")
        .not("customer_name", "ilike", "%demo%").not("customer_name", "ilike", "%démo%")
        .gte("created_at", new Date(now - 7 * 86400000).toISOString())
        .order("created_at", { ascending: false }).limit(3);
      const recentOrders = recentError ? [] : (recent || []).map((row) => ({
        ageSeconds: Math.max(0, Math.floor((now - Date.parse(row.created_at)) / 1000)),
      })).filter((row) => Number.isFinite(row.ageSeconds));
      return reply(origin, { deliveredCount: count || 0, recentOrders, serverTime: now, promotionEnd: PROMO_END });
    } catch { return reply(origin, { error: "stats_unavailable" }, 503); }
  }
  if (req.method !== "POST") {
    return reply(origin, { error: "method_not_allowed" }, 405);
  }

  try {
    const b = await req.json();
    const name = clean(b.name, 120);
    const phone = String(b.phone || "").replace(/[^\d+]/g, "").slice(0, 25);
    const quantity = Number(b.quantity);
    const zone = String(b.zone || "");
    const commune = clean(b.commune || b.city, 100);
    const quartier = clean(b.quartier || b.landmark, 160);
    const rid = clean(b.clientRequestId, 100);
    const tracking = b.tracking && typeof b.tracking === "object" ? b.tracking : {};

    if (
      name.length < 2 ||
      phone.replace(/\D/g, "").length < 8 ||
      ![1, 2, 3].includes(quantity) ||
      !["abidjan", "interieur"].includes(zone) ||
      !commune ||
      !quartier ||
      rid.length < 8
    ) {
      return reply(origin, { error: "invalid_payload" }, 400);
    }

    const subtotal = quantity === 1 ? 5000 : quantity === 2 ? 10000 : 12000;
    const fee = quantity === 1 ? (zone === "abidjan" ? 1000 : 2000) : 0;
    const total = subtotal + fee;

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: old } = await sb
      .from("orders")
      .select("*")
      .eq("client_request_id", rid)
      .eq("store_id", STORE)
      .maybeSingle();

    if (old) return reply(origin, { ok: true, duplicate: true, order: old }, 200);

    if (Date.now() >= PROMO_END) return reply(origin, { error: "promotion_expired" }, 410);

    let num = "";
    for (let i = 0; i < 5; i++) {
      const n = "HAL-" + Math.floor(100000 + Math.random() * 900000);
      const { data } = await sb.from("orders").select("id").eq("order_number", n).maybeSingle();
      if (!data) {
        num = n;
        break;
      }
    }
    if (!num) return reply(origin, { error: "number_generation_failed" }, 500);

    const payment = zone === "abidjan" ? "Paiement à la livraison" : "Paiement avant expédition";
    const row: any = {
      order_number: num,
      status: "new",
      customer_name: name,
      phone,
      country_code: "CI",
      country_name: "Côte d’Ivoire",
      city: zone === "abidjan" ? "Abidjan" : clean(b.city || commune, 100),
      commune,
      quartier,
      quantity,
      product_name: "Haleine — LAO LI SHI 50 g",
      currency: "XOF",
      unit_price: quantity === 3 ? 4000 : 5000,
      delivery_fee: fee,
      subtotal,
      total,
      payment_method: payment,
      payment_mode: zone === "abidjan" ? "cod" : "prepaid",
      phone_normalized: phone,
      store_id: STORE,
      store_name: "HaleinePure",
      source_domain: "haleinepure.destockagerapide.com",
      product_sku: "haleine-lao-li-shi-50g",
      source: "site",
      source_detail: clean(tracking.utm_content),
      commercial_status: "new",
      fulfillment_status: "pending",
      payment_status: zone === "abidjan" ? "due" : "awaiting_payment",
      client_request_id: rid,
      utm_source: clean(tracking.utm_source),
      utm_medium: clean(tracking.utm_medium),
      utm_campaign: clean(tracking.utm_campaign),
      fbclid: clean(tracking.fbclid),
    };

    const { data, error } = await sb.from("orders").insert(row).select("*").single();

    if (error) {
      console.error("haleinepure_insert_failed", error.code, error.message);
      if (error.code === "23505") {
        const { data: dup } = await sb
          .from("orders")
          .select("*")
          .eq("client_request_id", rid)
          .eq("store_id", STORE)
          .maybeSingle();
        if (dup) return reply(origin, { ok: true, duplicate: true, order: dup }, 200);
      }
      return reply(origin, { error: "insert_failed" }, 500);
    }

    return reply(origin, { ok: true, order: data }, 201);
  } catch (error) {
    console.error("haleinepure_bad_request", error instanceof Error ? error.message : String(error));
    return reply(origin, { error: "bad_request" }, 400);
  }
});
