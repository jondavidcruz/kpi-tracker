import { NextResponse } from "next/server";
import { verify, claimDeal, passDeal } from "@/lib/cascade";

export const dynamic = "force-dynamic";

// Public — buyers reach this from the "I want it" / "Pass" buttons in the offer email.
// Guarded by a signed token so only our emailed links work.
function page(title: string, body: string): NextResponse {
  return new NextResponse(
    `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
     <body style="font-family:Arial,sans-serif;background:#0b1f3a;color:#fff;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0">
       <div style="max-width:440px;text-align:center;padding:32px">
         <div style="font-size:44px">${title.startsWith("🎉") ? "🎉" : title.startsWith("👍") ? "👍" : "⚠️"}</div>
         <h1 style="font-size:22px;margin:12px 0">${title.replace(/^[^ ]+ /, "")}</h1>
         <p style="color:#cdd7e5;font-size:15px;line-height:1.5">${body}</p>
         <p style="color:#8aa0bd;font-size:12px;margin-top:24px">Freedom Offers</p>
       </div>
     </body></html>`,
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const d = url.searchParams.get("d") ?? "";
  const b = url.searchParams.get("b") ?? "";
  const a = url.searchParams.get("a") ?? "";
  const s = url.searchParams.get("s") ?? "";
  if (!d || !b || !a || !s || !verify(d, b, a, s)) return page("⚠️ Invalid link", "This link is invalid or has expired. Reply to the email and we'll sort it out.");

  if (a === "claim") {
    const res = await claimDeal(d, b);
    if (res === "claimed") return page("🎉 You've got first dibs!", "We'll send you the full package (comps, photos, terms) shortly. Talk soon.");
    if (res === "taken") return page("👍 Just missed it", "Another buyer claimed this one first — but you're on the list and we'll send you the next deal that fits your buy box.");
    return page("⚠️ Not found", "We couldn't find that deal. Reply to the email and we'll help.");
  }
  if (a === "pass") {
    await passDeal(d, b);
    return page("👍 Got it", "No problem — we'll offer this one to the next buyer. You'll still receive future deals that match your buy box.");
  }
  return page("⚠️ Unknown action", "Reply to the email and we'll help.");
}
