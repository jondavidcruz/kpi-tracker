// 📚 How to read the market — a plain-English teaching panel so anyone (Jon, Viktoriia, the team)
// can use the Target Markets tools without guessing (Jon 2026-11-12: "teach us how to look at the
// market using these different tools"). Server component, collapsible, lives at the top of /markets.

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-[13px] font-black text-white">{n}</div>
      <div className="min-w-0">
        <div className="text-[13px] font-bold text-slate-800">{title}</div>
        <div className="mt-0.5 text-[12px] leading-relaxed text-slate-600">{children}</div>
      </div>
    </div>
  );
}

function Term({ icon, name, children }: { icon: string; name: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="text-[13px] font-bold text-slate-800">{icon} {name}</div>
      <div className="mt-1 text-[12px] leading-relaxed text-slate-600">{children}</div>
    </div>
  );
}

export default function MarketGuide() {
  return (
    <details className="rounded-2xl border border-sky-200 bg-sky-50/50 shadow-sm">
      <summary className="cursor-pointer list-none px-4 py-3 text-[15px] font-black text-slate-800">
        📚 How to read the market <span className="font-semibold text-slate-400">— click to learn how to pick which market to pull (start here)</span>
      </summary>
      <div className="space-y-4 px-4 pb-4">
        <p className="text-[12px] text-slate-500">
          Our whole job is to find <b>cheap land that a builder will soon pay a premium for</b>, in areas no other
          wholesaler is working yet. These tools tell you exactly where that is. Here&apos;s the 1-minute way to use them.
        </p>

        {/* The playbook */}
        <div className="rounded-xl border border-emerald-200 bg-white p-4">
          <div className="mb-3 text-[13px] font-black text-emerald-700">🎯 The 1-minute market pick</div>
          <div className="space-y-3">
            <Step n={1} title="Open the 📋 Pull Priority list (top of this page)">
              It&apos;s already ranked. The top rows are the best markets to pull right now — you usually don&apos;t need the map at all.
            </Step>
            <Step n={2} title="Look for a high 🍩 Conversion Ring">
              A high ring (60–100) means <b>cheap land is actively turning into houses there</b> — builders are expanding into it.
              That&apos;s the &quot;doughnut ring&quot; where land values are about to jump. A low ring means it&apos;s either maxed
              out (no land left) or dead (nobody building yet) — skip it.
            </Step>
            <Step n={3} title="Make sure there are 💰 buyers waiting">
              Buyers &gt; 0 means our vetted developers already want land there, so we have somewhere to <b>sell</b> the deal.
              A great ring with zero buyers is a dead end.
            </Step>
            <Step n={4} title="Prefer a 🧪 test market (least competition)">
              The 🧪 badge means it&apos;s a conversion ring we can sell into that we <b>haven&apos;t saturated</b> and other
              wholesalers likely haven&apos;t either. That&apos;s the freshest ground — pull a small batch and measure before scaling.
            </Step>
            <Step n={5} title="Pull, then watch 💵 offers made">
              After you pull + text, check the <b>pull → close funnel</b>. The <b>💵 offers</b> number is the real signal:
              it means sellers are responding and we&apos;re making offers. High offers = hot market → pull more. Zero offers
              after a full batch = the market isn&apos;t responding → move on.
            </Step>
          </div>
        </div>

        {/* Non-negotiables */}
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
          <div className="mb-2 text-[13px] font-black text-amber-800">⛳ Our land rules (non-negotiable)</div>
          <ul className="space-y-1.5 text-[12px] text-amber-900">
            <li>💰 <b>Only land that sells for $50k+.</b> We do not touch $2k junk lots — every land number on this page already filters to $50k+ sales.</li>
            <li>🌊 <b>Prefer real waterfront &amp; wealthy areas</b> — oceanfront/lakefront where rich people build, not a cheap canal in a poor area. Wealth + waterfront is where builders pay the most for land.</li>
            <li>🧭 <b>Not already saturated</b> — favor 🧪 test markets and &quot;never pulled / clear&quot; coverage over places we (or everyone else) already hammer.</li>
          </ul>
        </div>

        {/* Glossary */}
        <div>
          <div className="mb-2 text-[13px] font-black text-slate-700">📖 What each number means</div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Term icon="🌱" name="Land sold (30/90/180d)">How many $50k+ land parcels actually sold recently. More selling = a liquid, active market we can move deals in.</Term>
            <Term icon="🏗" name="New construction sold">New homes sold recently = the building frontier is expanding there. This is what pulls land values up.</Term>
            <Term icon="🍩" name="Conversion Ring (0–100)">The headline score. High = cheap land + lots of new building + rising prices = land about to convert to housing. Our sweet spot.</Term>
            <Term icon="🏗" name="Builder land budget (~$Xk)">A rough guide to what a builder could pay for a lot (~15% of the finished-home price). Your offer ceiling and the seller&apos;s realistic number. Always underwrite the real deal.</Term>
            <Term icon="📈" name="YoY">Land sales vs. a year ago. Green/positive = the market is growing. Red = cooling.</Term>
            <Term icon="💰" name="Buyers waiting">How many of our vetted developers&apos; buy-boxes cover this market — i.e. who we can sell the deal to.</Term>
            <Term icon="🟢🟠" name="Target vs Watch">🟢 Target = strong enough to pull now. 🟠 Watch = promising, keep an eye on it.</Term>
            <Term icon="🗺" name="Coverage">Whether WE&apos;ve pulled here: ✅ clear / 🆕 never / 🕒 cooldown (pulled recently — wait before re-pulling).</Term>
            <Term icon="💵" name="Offers made (funnel)">Of the leads from a pull, how many we made an offer to. The clearest read on whether a market is responding to our SMS.</Term>
            <Term icon="🏠" name="Area home price">Just a wealth signal for the area — NOT the land price. We care about land, so this is a greyed footnote.</Term>
          </div>
        </div>

        <p className="rounded-lg bg-slate-100 px-3 py-2 text-[11px] text-slate-500">
          <b>TL;DR for picking a market:</b> high 🍩 ring + 💰 buyers + 🧪 test badge + $50k&#43; land + (ideally) waterfront/wealthy →
          pull a small batch → if 💵 offers come in, scale it up.
        </p>
      </div>
    </details>
  );
}
