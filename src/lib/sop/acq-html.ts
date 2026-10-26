// Auto-embedded from the Acquisitions SOP HTML, served through a login-gated route.
const HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<style>
:root{
  padding-top:env(safe-area-inset-top,0px);
  padding-bottom:env(safe-area-inset-bottom,0px);
}
img{max-width:100%}
[hidden]{display:none!important}
</style>
<title>Acquisitions SOP</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Zilla+Slab:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap">
<style>
:root{
  --ink:#14263a;
  --ink-2:#4a5a6d;
  --paper:#f6f3ee;
  --panel:#fffdf9;
  --gold:#b08d57;
  --rule:#ddd6ca;
  --hold:#9a2f2f;
  --clear:#2d6a4a;
  --flag:#8a6a1f;
  color-scheme:light;
}
@media (prefers-color-scheme:dark){
  :root:not([data-theme="light"]){
    --ink:#eae4d8; --ink-2:#9aa8b8; --paper:#0d1724; --panel:#152433;
    --gold:#c9a86b; --rule:#2a3b4e; --hold:#e07a7a; --clear:#6cc19a; --flag:#d9b45c;
    color-scheme:dark;
  }
}
:root[data-theme="dark"]{
  --ink:#eae4d8; --ink-2:#9aa8b8; --paper:#0d1724; --panel:#152433;
  --gold:#c9a86b; --rule:#2a3b4e; --hold:#e07a7a; --clear:#6cc19a; --flag:#d9b45c;
  color-scheme:dark;
}
*{box-sizing:border-box}
body{
  background:var(--paper); color:var(--ink);
  font-family:"IBM Plex Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
  font-size:15px; line-height:1.55; margin:0;
}
.wrap{
  max-width:960px; margin:0 auto;
  padding-left:max(16px,env(safe-area-inset-left,0px));
  padding-right:max(16px,env(safe-area-inset-right,0px));
  padding-block:0 64px;
}
h1,h2,h3,h4{font-family:"Zilla Slab",Georgia,serif; text-wrap:balance; margin:0}
.mono{font-family:"IBM Plex Mono",ui-monospace,monospace}
header{padding-block:40px 28px; border-bottom:3px solid var(--ink)}
.eyebrow{
  font-family:"IBM Plex Mono",monospace; font-size:11.5px; font-weight:600;
  letter-spacing:.14em; text-transform:uppercase; color:var(--gold);
}
h1{font-size:clamp(30px,6vw,46px); font-weight:700; line-height:1.05; margin-top:10px; letter-spacing:-.01em}
.sub{color:var(--ink-2); font-size:16px; max-width:62ch; margin-top:12px}
.prime{
  margin-top:26px; background:var(--ink); color:var(--paper);
  border-left:6px solid var(--gold); padding:20px 22px;
}
@media (prefers-color-scheme:dark){
  :root:not([data-theme="light"]) .prime{background:#1d3448; color:var(--ink)}
}
:root[data-theme="dark"] .prime{background:#1d3448; color:var(--ink)}
.prime .lbl{
  font-family:"IBM Plex Mono",monospace; font-size:11px; letter-spacing:.14em;
  text-transform:uppercase; color:var(--gold); font-weight:600;
}
.prime p{margin:.5em 0 0; font-size:17px; line-height:1.5}
.prime strong{font-weight:700}
.board{margin-top:34px}
.board h2{font-size:13px; font-family:"IBM Plex Mono",monospace; letter-spacing:.12em; text-transform:uppercase; color:var(--ink-2); font-weight:600}
.cols{display:flex; flex-wrap:wrap; gap:8px; margin-top:12px}
.col{
  flex:1 1 128px; min-width:0; background:var(--panel); border:1px solid var(--rule);
  border-top:3px solid var(--gold); padding:10px 11px;
}
.col .n{font-family:"IBM Plex Mono",monospace; font-size:11px; color:var(--gold); font-weight:600}
.col .t{font-family:"Zilla Slab",serif; font-weight:600; font-size:14px; margin-top:3px; line-height:1.2}
.col .w{font-size:11.5px; color:var(--ink-2); margin-top:4px; font-family:"IBM Plex Mono",monospace}
.phase{margin-top:46px; scroll-margin-top:20px}
.phead{display:flex; gap:16px; align-items:baseline; border-bottom:2px solid var(--rule); padding-bottom:10px}
.pnum{
  font-family:"IBM Plex Mono",monospace; font-size:34px; font-weight:600;
  color:var(--gold); line-height:1; flex:0 0 auto;
}
.ptitle{min-width:0}
.ptitle h2{font-size:clamp(21px,3.6vw,27px); font-weight:700; line-height:1.15}
.pmeta{
  font-family:"IBM Plex Mono",monospace; font-size:11.5px; color:var(--ink-2);
  margin-top:5px; letter-spacing:.03em;
}
.pbody{margin-top:18px}
.pbody > p{max-width:66ch; color:var(--ink-2)}
.pbody > p strong{color:var(--ink)}
h3.step{
  font-size:16px; font-weight:600; margin-top:20px;
  display:flex; gap:9px; align-items:baseline;
}
h3.step .dot{color:var(--gold); font-family:"IBM Plex Mono",monospace; font-size:13px}
.pbody ul{margin:.5em 0 0; padding-left:20px}
.pbody li{margin:.3em 0; max-width:64ch}
.pbody li strong{font-weight:600}
.fields{display:grid; grid-template-columns:repeat(auto-fit,minmax(168px,1fr)); gap:1px; background:var(--rule); border:1px solid var(--rule); margin-top:14px}
.field{background:var(--panel); padding:9px 11px; min-width:0}
.field .fn{font-family:"IBM Plex Mono",monospace; font-size:10.5px; letter-spacing:.07em; text-transform:uppercase; color:var(--gold); font-weight:600}
.field .fv{font-size:13.5px; margin-top:2px; line-height:1.35}
.gate{margin-top:22px; border:2px solid var(--hold); background:var(--panel)}
.gate[data-clear="1"]{border-color:var(--clear)}
.gbar{
  display:flex; gap:10px; align-items:center; flex-wrap:wrap;
  background:var(--hold); color:#fff; padding:9px 13px;
}
.gate[data-clear="1"] .gbar{background:var(--clear)}
.gbar .gl{font-family:"IBM Plex Mono",monospace; font-size:11.5px; font-weight:600; letter-spacing:.13em; text-transform:uppercase}
.gbar .gs{margin-left:auto; font-family:"IBM Plex Mono",monospace; font-size:11.5px; font-weight:600}
.gate ul.checks{list-style:none; margin:0; padding:12px 13px; display:grid; gap:2px}
.checks li{margin:0; max-width:none}
.checks label{
  display:flex; gap:10px; align-items:flex-start; padding:7px 8px;
  cursor:pointer; border-radius:3px; line-height:1.45;
}
.checks label:hover{background:color-mix(in srgb,var(--gold) 11%,transparent)}
.checks input{
  appearance:none; flex:0 0 auto; width:17px; height:17px; margin-top:1px;
  border:2px solid var(--ink-2); border-radius:3px; background:transparent; cursor:pointer;
}
.checks input:checked{background:var(--clear); border-color:var(--clear)}
.checks input:checked::after{content:"✓"; display:block; color:#fff; font-size:12px; line-height:13px; text-align:center; font-weight:700}
.checks input:focus-visible{outline:2px solid var(--gold); outline-offset:2px}
.checks input:checked + span{color:var(--ink-2); text-decoration:line-through; text-decoration-color:var(--rule)}
.gfail{padding:0 13px 13px; font-size:13px; color:var(--ink-2); border-top:1px dashed var(--rule); margin-top:4px; padding-top:11px}
.gfail b{color:var(--hold); font-family:"IBM Plex Mono",monospace; font-size:11px; letter-spacing:.08em; text-transform:uppercase}
.note{background:var(--panel); border-left:4px solid var(--gold); padding:14px 16px; margin-top:18px}
.note.warn{border-left-color:var(--hold)}
.note h4{font-size:14.5px; font-weight:700; margin-bottom:5px}
.note p,.note ul{font-size:14px; color:var(--ink-2); margin:0}
.note p + p{margin-top:.6em}
.note ul{padding-left:19px; margin-top:.4em}
.buckets{display:grid; grid-template-columns:repeat(auto-fit,minmax(215px,1fr)); gap:12px; margin-top:16px}
.bucket{background:var(--panel); border:1px solid var(--rule); border-top:4px solid var(--gold); padding:14px 15px; min-width:0}
.bucket .see{font-family:"IBM Plex Mono",monospace; font-size:10.5px; letter-spacing:.08em; text-transform:uppercase; color:var(--ink-2); font-weight:600}
.bucket .say{font-family:"Zilla Slab",serif; font-size:17px; font-weight:700; margin:7px 0 6px; line-height:1.2; color:var(--gold)}
.bucket p{font-size:13.5px; color:var(--ink-2); margin:0}
.tscroll{overflow-x:auto; margin-top:16px; border:1px solid var(--rule)}
table{border-collapse:collapse; width:100%; font-size:13.5px; background:var(--panel)}
th,td{text-align:left; padding:9px 12px; border-bottom:1px solid var(--rule); vertical-align:top}
th{
  font-family:"IBM Plex Mono",monospace; font-size:10.5px; letter-spacing:.08em;
  text-transform:uppercase; color:var(--gold); font-weight:600; white-space:nowrap;
}
tr:last-child td{border-bottom:0}
td.num{font-family:"IBM Plex Mono",monospace; font-variant-numeric:tabular-nums; white-space:nowrap; font-weight:600}
.formula{font-family:"IBM Plex Mono",monospace; font-size:12.5px; line-height:1.7; background:var(--ink); color:var(--paper); padding:16px 18px; margin-top:14px; overflow-x:auto; white-space:pre}
@media (prefers-color-scheme:dark){ :root:not([data-theme="light"]) .formula{background:#0a1420} }
:root[data-theme="dark"] .formula{background:#0a1420}
.formula b{color:var(--gold); font-weight:600}
.terms{background:var(--ink); color:var(--paper); padding:22px 24px; margin-top:22px}
@media (prefers-color-scheme:dark){
  :root:not([data-theme="light"]) .terms{background:#1d3448; color:var(--ink)}
  :root:not([data-theme="light"]) .terms h3{color:var(--ink)}
}
:root[data-theme="dark"] .terms{background:#1d3448; color:var(--ink)}
.terms h3{font-size:19px; font-weight:700; color:#fff}
:root[data-theme="dark"] .terms h3{color:var(--ink)}
.terms ol{margin:.8em 0 0; padding-left:21px; font-size:14.5px}
.terms li{margin:.45em 0; max-width:62ch}
.terms .ph{
  font-family:"IBM Plex Mono",monospace; font-weight:600; color:var(--gold);
  font-size:15px; display:inline-block; margin-top:2px;
}
.ctl{margin-top:40px; padding-top:18px; border-top:1px solid var(--rule); display:flex; gap:12px; align-items:center; flex-wrap:wrap}
button.reset{
  font-family:"IBM Plex Mono",monospace; font-size:12px; font-weight:600; letter-spacing:.06em;
  text-transform:uppercase; background:transparent; color:var(--ink);
  border:1.5px solid var(--ink-2); padding:8px 15px; cursor:pointer; border-radius:3px;
}
button.reset:hover{border-color:var(--gold); color:var(--gold)}
button.reset:focus-visible{outline:2px solid var(--gold); outline-offset:2px}
.ctl p{font-size:12.5px; color:var(--ink-2); margin:0; max-width:52ch}
@media (max-width:560px){
  .pnum{font-size:26px}
  .phead{gap:11px}
}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
</style>
</head>
<body>
<div class="wrap">

<header>
  <div class="eyebrow">Freedom Offers LLC &middot; Acquisitions</div>
  <h1>Acquisitions SOP</h1>
  <p class="sub">How a sales rep takes one seller lead from the first ring to a signed contract &mdash; call in five minutes, offer the same day, and finish the deal before moving to the next lead.</p>
</header>

<div class="prime">
  <div class="lbl">Standing order</div>
  <p><strong>Speed is the edge. Same day, every time.</strong> Call in five minutes, offer within the hour, same process on every lead. The current standard is an offer on the second call &mdash; the goal is an offer on the <strong>first</strong> call: put the seller on a short hold, underwrite, come back, and close.</p>
</div>

<section class="board">
  <h2>War Room board &mdash; six columns</h2>
  <div class="cols">
    <div class="col"><div class="n">01</div><div class="t">Catch the lead</div><div class="w">5 min</div></div>
    <div class="col"><div class="n">02</div><div class="t">Verify + comp</div><div class="w">before the call</div></div>
    <div class="col"><div class="n">03</div><div class="t">Process call</div><div class="w">run the script</div></div>
    <div class="col"><div class="n">04</div><div class="t">Underwrite</div><div class="w">15 min clock</div></div>
    <div class="col"><div class="n">05</div><div class="t">Make the offer</div><div class="w">same day / 1 hr</div></div>
    <div class="col"><div class="n">06</div><div class="t">Contract + sign</div><div class="w">walk it, sign it</div></div>
  </div>
</section>

<!-- ==================== PHASE 1 ==================== -->
<section class="phase">
  <div class="phead">
    <div class="pnum">01</div>
    <div class="ptitle">
      <h2>Catch the lead &mdash; call within five minutes</h2>
      <div class="pmeta">5 minutes &middot; one named owner &middot; the clock starts the second the lead lands</div>
    </div>
  </div>
  <div class="pbody">
    <p>A new lead hits the War Room and the system does two things automatically: it drops a <strong>&ldquo;Call now&rdquo;</strong> task on you and fires the seller a welcome text that <strong>promises a call in five minutes</strong>. That promise is a clock, and you own it. Reach rates fall off a cliff after minute five &mdash; the fastest rep wins the deal before anyone else dials.</p>

    <h3 class="step"><span class="dot">&#9656;</span> Claim it</h3>
    <ul>
      <li>Put your name in <strong>Owner</strong>. An unowned lead is a lost lead.</li>
      <li>Open the lead card so your notes, calls and the offer all live in one place.</li>
    </ul>

    <h3 class="step"><span class="dot">&#9656;</span> Call &mdash; now, not in ten minutes</h3>
    <ul>
      <li>Dial from the War Room (click-to-call) so the call logs itself on the lead.</li>
      <li><strong>No answer?</strong> Leave a short voicemail and send a text &mdash; the system keeps nudging you every few hours until the lead is reached. Do not let it go cold.</li>
    </ul>

    <div class="gate" data-gate="g1">
      <div class="gbar"><span class="gl">Gate 1 &mdash; caught in time</span><span class="gs" data-count>0 / 4</span></div>
      <ul class="checks">
        <li><label><input type="checkbox"><span>My name is in the <strong>Owner</strong> field.</span></label></li>
        <li><label><input type="checkbox"><span>I called within <strong>5 minutes</strong> of the lead landing.</span></label></li>
        <li><label><input type="checkbox"><span>No answer &rarr; voicemail left <em>and</em> a text sent.</span></label></li>
        <li><label><input type="checkbox"><span>The welcome text went out (the 5-minute promise the seller is holding you to).</span></label></li>
      </ul>
      <div class="gfail"><b>If held</b> &mdash; you are already losing to whoever called faster. Dial now; everything else waits.</div>
    </div>
  </div>
</section>

<!-- ==================== PHASE 2 ==================== -->
<section class="phase">
  <div class="phead">
    <div class="pnum">02</div>
    <div class="ptitle">
      <h2>Verify the property &mdash; know it before they do</h2>
      <div class="pmeta">Before the deep call &middot; four lookups &middot; is it listed, and what is it worth</div>
    </div>
  </div>
  <div class="pbody">
    <p>Before you dig into the process call, pull the address up and know the property cold. <strong>Whether it is listed right now changes the entire play</strong> &mdash; a currently-listed home is a different conversation than an off-market owner. Confirm it, then start the numbers so you walk into the call already comping.</p>

    <h3 class="step"><span class="dot">&#9656;</span> Run the address on all four</h3>
    <ul>
      <li><strong>Regrid</strong> &mdash; parcel, acreage, zoning, flood/wetlands (land diligence).</li>
      <li><strong>REI AI</strong> &mdash; comps + value.</li>
      <li><strong>Propwire</strong> &mdash; free comps (your own account).</li>
      <li><strong>Redfin / Zillow</strong> &mdash; free public comps and <strong>listing history</strong>: is it on the market now, when was it last listed, at what price, did it fail to sell?</li>
      <li><strong>Elevation contours (land)</strong> &mdash; after you&rsquo;ve comped and checked flood zone + wetlands, pull the <strong>topo / contour lines</strong> (Regrid contour layer, or Google Earth / USGS topo) to confirm the <strong>slope</strong>. Flat &amp; buildable sells; steep grade or a ravine kills a build &mdash; know it before you offer.</li>
    </ul>

    <h3 class="step"><span class="dot">&#9656;</span> Start the financials</h3>
    <ul>
      <li>Pull comps for the ARV (homes) or $/acre (land). Note anything you can see on owed balance, liens, or condition.</li>
      <li>Confirm beds / baths / sqft / lot / year-built from the software so you <strong>don&rsquo;t ask the seller what you can already see</strong> &mdash; you only ask them for what the data can&rsquo;t tell you (the ages of the big-ticket items).</li>
    </ul>

    <div class="gate" data-gate="g2">
      <div class="gbar"><span class="gl">Gate 2 &mdash; property verified</span><span class="gs" data-count>0 / 5</span></div>
      <ul class="checks">
        <li><label><input type="checkbox"><span>Ran the address on <strong>Regrid, REI AI, Propwire, and Zillow/Redfin</strong>.</span></label></li>
        <li><label><input type="checkbox"><span>Listing status confirmed &mdash; <strong>listed now?</strong> last-listed date + price recorded.</span></label></li>
        <li><label><input type="checkbox"><span>Comps pulled &mdash; ARV (home) or $/acre (land) in hand.</span></label></li>
        <li><label><input type="checkbox"><span>Land: flood zone + wetlands + <strong>elevation contours</strong> checked &mdash; slope confirmed (flat vs steep).</span></label></li>
        <li><label><input type="checkbox"><span>Beds / baths / sqft / lot / year confirmed from software, not from the seller.</span></label></li>
      </ul>
      <div class="gfail"><b>If held</b> &mdash; finish the lookups first. Walking into the call without the numbers means a second call to get them, and slow kills deals.</div>
    </div>
  </div>
</section>

<!-- ==================== PHASE 3 ==================== -->
<section class="phase">
  <div class="phead">
    <div class="pnum">03</div>
    <div class="ptitle">
      <h2>The process call &mdash; run the script</h2>
      <div class="pmeta">The call that wins the deal &middot; rapport first &middot; notes the underwriter can read</div>
    </div>
  </div>
  <div class="pbody">
    <p>This is the call that wins the deal. Run the <strong>Traditional Seller script</strong> in the War Room. The order is not optional: <strong>rapport first, always</strong> &mdash; don&rsquo;t touch the house until you&rsquo;ve built it. The seller should talk more than you do. Ask one question, then listen.</p>

    <h3 class="step"><span class="dot">&#9656;</span> Build rapport (do not skip)</h3>
    <ul>
      <li>How long in the home? How&rsquo;d they end up there? Raise a family there? Let them talk.</li>
    </ul>

    <h3 class="step"><span class="dot">&#9656;</span> Condition &amp; the big-ticket ages (this feeds underwriting)</h3>
    <ul>
      <li>Confirm &mdash; don&rsquo;t ask &mdash; beds/baths/sqft from your software, then get the <strong>AGE</strong> of each item that moves the number:</li>
      <li><strong>Roof</strong> (age / last replaced) &middot; <strong>HVAC / furnace</strong> &middot; <strong>Water heater</strong> (original or swapped) &middot; <strong>Foundation</strong> (cracks / settling) &middot; <strong>Windows</strong> (single-pane vs updated).</li>
      <li>Close it out: <em>&ldquo;Anything else major I wouldn&rsquo;t see on paper?&rdquo;</em></li>
    </ul>

    <h3 class="step"><span class="dot">&#9656;</span> Motivation, timeline, and the soft close</h3>
    <ul>
      <li>Why now, how fast, what the next chapter looks like, what would make this the right move.</li>
      <li>Soft close: <em>&ldquo;Let me run everything past our underwriters and come back with what the property qualifies for.&rdquo;</em> <strong>Always capture the email</strong> &mdash; the offer goes in writing.</li>
      <li><strong>Fill every note in detail.</strong> The underwriter reads these to price the deal; a thin note is a slow second call.</li>
    </ul>

    <div class="gate" data-gate="g3">
      <div class="gbar"><span class="gl">Gate 3 &mdash; process call complete</span><span class="gs" data-count>0 / 5</span></div>
      <ul class="checks">
        <li><label><input type="checkbox"><span>Built rapport <strong>before</strong> any house talk.</span></label></li>
        <li><label><input type="checkbox"><span>Every big-ticket item has an <strong>age</strong> &mdash; roof, HVAC, water heater, foundation, windows.</span></label></li>
        <li><label><input type="checkbox"><span>Motivation + timeline captured.</span></label></li>
        <li><label><input type="checkbox"><span>Seller&rsquo;s email captured (offer goes in writing).</span></label></li>
        <li><label><input type="checkbox"><span>Notes filled in detail &mdash; underwriter-ready, no blanks.</span></label></li>
      </ul>
      <div class="gfail"><b>If held</b> &mdash; you can&rsquo;t price what you didn&rsquo;t ask. Get the missing age or motivation before you hang up; a callback costs you the speed edge.</div>
    </div>
  </div>
</section>

<!-- ==================== PHASE 4 ==================== -->
<section class="phase">
  <div class="phead">
    <div class="pnum">04</div>
    <div class="ptitle">
      <h2>Underwrite &mdash; the fifteen-minute clock</h2>
      <div class="pmeta">Starts the second the call ends &middot; both numbers &middot; cash and novation</div>
    </div>
  </div>
  <div class="pbody">
    <p>The moment the process call ends, you are on a <strong>15-minute clock</strong> (the War Room drops the task and times it). Run <strong>both</strong> numbers in the Underwriting calculator &mdash; cash and novation &mdash; because the right structure is whichever nets the seller the most while protecting our spread. The full method is the <a href="#underwriting" style="color:var(--gold);font-weight:600">deep underwriting SOP below</a>.</p>

    <h3 class="step"><span class="dot">&#9656;</span> Run it</h3>
    <ul>
      <li><strong>Cash</strong>: ARV &times; market% &minus; repairs &minus; fee. Repairs come straight from the big-ticket ages you captured.</li>
      <li><strong>Novation</strong>: list &times; 95% &minus; credits &minus; commission &minus; closing. Use it when the condition is good &mdash; it usually nets the seller <em>more</em> than cash.</li>
      <li>Set the <strong>offer ladder</strong>: opening (below MAO), target, floor. You open below MAO and negotiate up &mdash; never lead with your best number.</li>
    </ul>

    <div class="gate" data-gate="g4">
      <div class="gbar"><span class="gl">Gate 4 &mdash; underwritten</span><span class="gs" data-count>0 / 4</span></div>
      <ul class="checks">
        <li><label><input type="checkbox"><span>Done inside <strong>15 minutes</strong> of the call ending.</span></label></li>
        <li><label><input type="checkbox"><span>Cash MAO computed (ARV &times; market% &minus; repairs &minus; fee).</span></label></li>
        <li><label><input type="checkbox"><span>Novation run too &mdash; and compared (good condition &rarr; nets the seller more).</span></label></li>
        <li><label><input type="checkbox"><span>Offer ladder set: opening / target / floor.</span></label></li>
      </ul>
      <div class="gfail"><b>If held</b> &mdash; a deal sitting in underwriting past the clock is a deal cooling off. Price it now; perfect is the enemy of same-day.</div>
    </div>
  </div>
</section>

<!-- ==================== PHASE 5 ==================== -->
<section class="phase">
  <div class="phead">
    <div class="pnum">05</div>
    <div class="ptitle">
      <h2>Make the offer &mdash; same day, within the hour</h2>
      <div class="pmeta">Within ~1 hour of processing &middot; cash and novation on the table &middot; negotiate off the ladder</div>
    </div>
  </div>
  <div class="pbody">
    <p>Give the offer the <strong>same day &mdash; within an hour</strong> of processing the lead. Sooner is better. Today the team offers on the second call; <strong>the goal is the first call</strong>: put the seller on a short hold while you underwrite, come back on the same call, and negotiate live. Speed and certainty are what beat a retail agent.</p>

    <h3 class="step"><span class="dot">&#9656;</span> Present both, then guide</h3>
    <ul>
      <li>Put <strong>cash and novation</strong> on the table and walk the seller to the one that fits their situation &mdash; speed/certainty (cash) vs. a higher net over a few months (novation).</li>
      <li>Negotiate off the ladder &mdash; open below MAO, move toward target, never cross the floor.</li>
      <li>Land on an agreed <strong>number + structure</strong>, or a firm next step with a time.</li>
    </ul>

    <div class="note">
      <h4>The advanced play &mdash; offer on the first call</h4>
      <p>Hold the seller for a few minutes (&ldquo;give me five to run this past underwriting&rdquo;), underwrite live, and come back with the number on the same call. One call from first ring to agreed offer is the standard we&rsquo;re building toward &mdash; it&rsquo;s the whole speed advantage, compounded.</p>
    </div>

    <div class="gate" data-gate="g5">
      <div class="gbar"><span class="gl">Gate 5 &mdash; offer made</span><span class="gs" data-count>0 / 4</span></div>
      <ul class="checks">
        <li><label><input type="checkbox"><span>Offer given the <strong>same day</strong>, within ~1 hour of processing.</span></label></li>
        <li><label><input type="checkbox"><span>Both <strong>cash + novation</strong> presented.</span></label></li>
        <li><label><input type="checkbox"><span>Negotiated off the ladder &mdash; did not open at (or drop below) the floor.</span></label></li>
        <li><label><input type="checkbox"><span>Agreement on price + structure &mdash; or a firm, timed next step.</span></label></li>
      </ul>
      <div class="gfail"><b>If held</b> &mdash; an offer that waits until tomorrow competes with everyone the seller called after you. Get the number to them today.</div>
    </div>
  </div>
</section>

<!-- ==================== PHASE 6 ==================== -->
<section class="phase">
  <div class="phead">
    <div class="pnum">06</div>
    <div class="ptitle">
      <h2>Contract sent &mdash; walk it, sign it, hand it off</h2>
      <div class="pmeta">Agreed number in writing &middot; explained line by line &middot; then it&rsquo;s dispo&rsquo;s</div>
    </div>
  </div>
  <div class="pbody">
    <p>Agreement reached &rarr; send the contract (PandaDoc) with the agreed price and structure. Then <strong>call the seller and walk it line by line</strong> &mdash; a confused seller stalls, a confident seller signs. Make it easy.</p>

    <h3 class="step"><span class="dot">&#9656;</span> Explain the clauses that matter</h3>
    <ul>
      <li><strong>&ldquo;And/or assigns&rdquo;</strong> &mdash; we may assign the contract to our buyer.</li>
      <li><strong>No-shop</strong> &mdash; they take it off the market while we work.</li>
      <li><strong>Liquidated damages</strong> &mdash; their max risk is the deposit, nothing more.</li>
      <li><strong>72-hour offer expiration</strong> &mdash; the number holds for three days.</li>
      <li>Lawyer objection? <em>&ldquo;Let&rsquo;s go over it together first so you have all your questions ready.&rdquo;</em></li>
    </ul>

    <h3 class="step"><span class="dot">&#9656;</span> Sign &amp; hand off clean</h3>
    <ul>
      <li>Get it signed. On signature the War Room posts to the Contracts channel, logs the contract type (assignment / novation / creative) on your KPIs, and <strong>kicks off the dispo buyer cascade</strong>.</li>
      <li>Hand to dispositions with the file complete &mdash; their clock starts the moment yours stops.</li>
    </ul>

    <div class="gate" data-gate="g6">
      <div class="gbar"><span class="gl">Gate 6 &mdash; signed + handed off</span><span class="gs" data-count>0 / 4</span></div>
      <ul class="checks">
        <li><label><input type="checkbox"><span>Contract sent with the <strong>agreed number + structure</strong>.</span></label></li>
        <li><label><input type="checkbox"><span>Walked the seller through it <strong>line by line</strong>.</span></label></li>
        <li><label><input type="checkbox"><span>Signed.</span></label></li>
        <li><label><input type="checkbox"><span>Handed to dispo &mdash; buyer cascade armed, contract type logged.</span></label></li>
      </ul>
      <div class="gfail"><b>If held</b> &mdash; a sent-but-unexplained contract is where deals die. Get the seller on the phone and walk it before it goes stale.</div>
    </div>
  </div>
</section>

<!-- ==================== UNDERWRITING DEEP SOP ==================== -->
<section class="phase" id="underwriting" style="scroll-margin-top:20px">
  <div class="phead">
    <div class="pnum">+</div>
    <div class="ptitle">
      <h2>Deep dive &mdash; the underwriting SOP</h2>
      <div class="pmeta">One path, same number for everyone &middot; cash &middot; novation &middot; land</div>
    </div>
  </div>
  <div class="pbody">
    <p>Underwriting is the heart of acquisitions. There is <strong>one method and one number</strong> &mdash; no manual repair overrides, no fudge knobs &mdash; so every rep prices the same deal the same way. Run it in the War Room calculator; every underwrite is timed, and the exported offer saves back on the lead.</p>

    <h3 class="step"><span class="dot">A</span> Cash offer on a house (assignment)</h3>
    <div class="formula"><b>repairs</b>       = sqft &times; rehab$/sf  +  checked major-system costs
<b>flipperTarget</b> = ARV &times; market%
<b>cash MAO</b>      = flipperTarget &minus; repairs &minus; HOA/dues &minus; extras &minus; assignment fee
<b>opening offer</b>  = cash MAO &times; (1 &minus; 10%)        // open 10% below MAO</div>
    <p style="margin-top:14px">The <strong>market %</strong> already bakes in the flipper&rsquo;s profit <em>and</em> their carry/money costs &mdash; so you only subtract <strong>known deal-specific costs</strong> (HOA, cash-for-keys, eviction, liens). Default 75%.</p>
    <div class="tscroll">
      <table>
        <thead><tr><th>Market tier</th><th>%</th><th>When</th></tr></thead>
        <tbody>
          <tr><td>Prime coastal</td><td class="num">85%</td><td>Push 88&ndash;90% on oceanfront / trophy</td></tr>
          <tr><td>Competitive urban</td><td class="num">80%</td><td>Strong metro core</td></tr>
          <tr><td>Strong suburban / metro</td><td class="num">75%</td><td>Default</td></tr>
          <tr><td>Mid-tier</td><td class="num">70%</td><td>Softer demand</td></tr>
          <tr><td>Rural</td><td class="num">65%</td><td>Thin buyer pool</td></tr>
          <tr><td>Extremely rural</td><td class="num">60%</td><td>Very few cash buyers</td></tr>
        </tbody>
      </table>
    </div>
    <div class="tscroll">
      <table>
        <thead><tr><th>Rehab level ($/sf)</th><th>Major-system add-ons</th><th>Assignment fee (by ARV)</th></tr></thead>
        <tbody>
          <tr><td>Cleanup $17 &middot; Lipstick $22 &middot; Interior $30</td><td>HVAC $7,000</td><td>&lt;$200k &rarr; $10k</td></tr>
          <tr><td>Full $35 &middot; Full+2 $45 &middot; Full+4 $55</td><td>Water heater $1,800 &middot; Windows $8,000</td><td>$200&ndash;350k &rarr; $15k &middot; $350&ndash;500k &rarr; $20k</td></tr>
          <tr><td>Full+6 $65 &middot; Full gut $75</td><td>Roof $12,000 &middot; Foundation $15,000</td><td>$500&ndash;750k &rarr; $25k &middot; $750k&ndash;1M &rarr; $30k &middot; $1M+ &rarr; $40k</td></tr>
        </tbody>
      </table>
    </div>
    <div class="note warn" style="margin-top:16px">
      <h4>Deal sanity &mdash; is the spread real?</h4>
      <p>cash MAO &divide; ARV over <strong>0.80 = red</strong> (too thin to assign) &middot; over <strong>0.72 = yellow</strong> (tight) &middot; else green. If the seller won&rsquo;t allow an assignment, switch to a <strong>double-close</strong> and subtract seller-side closing (&asymp;1.5% of buy + sell) from the MAO.</p>
    </div>

    <h3 class="step"><span class="dot">B</span> Novation offer (good condition &rarr; seller nets more)</h3>
    <div class="formula"><b>expectedSale</b> = list price &times; 95%            // realism: drops + concessions
<b>sellerClose</b>  = expectedSale &times; 1.5%           // seller side only
<b>net</b>          = expectedSale &minus; repairCredit &minus; (expectedSale &times; commission%)
                            &minus; sellerClose &minus; (HOA &times; holdMonths) &minus; extras &minus; reserve
<b>novation MAO</b>  = net &minus; min fee
<b>opening offer</b>  = novation MAO &times; (1 &minus; 7%)       // open 7% below</div>
    <p style="margin-top:14px">Valued on <strong>similar-condition</strong> value, not after-repair. Commission default 5%, hold 2 months (homes) / 5 months (land). Novation should let you offer the seller <strong>more</strong> than cash &mdash; if cash MAO comes out higher than novation MAO, something is off; re-check your inputs.</p>

    <h3 class="step"><span class="dot">C</span> Cash on land &mdash; lowest cap wins</h3>
    <div class="formula"><b>valueBase</b> = sold-comp avg, or median $/acre &times; acres  (comps mode)
            or EMV / assessed value                   (blind mode, no comps)
<b>third</b>     = valueBase &times; ~33% &minus; closing (~$1,500 all-in)
<b>land MAO</b>   = MIN( third , county assessed value , cheapest active listing )
<b>opening</b>   = land MAO &times; (1 &minus; 8%)</div>
    <p style="margin-top:14px">All three caps must pass and the <strong>lowest wins</strong>. Under 33% of EMV &rarr; buy outright or JV &middot; 33&ndash;50% &rarr; likely JV &middot; over 50% &rarr; double-close only if the spread survives both closings. Land with no sold comps is a <strong>blind listing</strong> &mdash; price off assessed value and flag it.</p>

    <div class="gate" data-gate="gU">
      <div class="gbar"><span class="gl">Gate U &mdash; the underwrite is defensible</span><span class="gs" data-count>0 / 4</span></div>
      <ul class="checks">
        <li><label><input type="checkbox"><span>Comps pulled &mdash; value is <strong>sourced</strong>, not guessed.</span></label></li>
        <li><label><input type="checkbox"><span>Repairs come from the <strong>big-ticket ages</strong> captured on the call.</span></label></li>
        <li><label><input type="checkbox"><span>Structure chosen = the one that nets the seller the most while the spread survives (sanity light not red).</span></label></li>
        <li><label><input type="checkbox"><span>Opened <strong>below</strong> MAO on the ladder &mdash; room to negotiate up.</span></label></li>
      </ul>
      <div class="gfail"><b>If held</b> &mdash; an offer you can&rsquo;t defend is an offer you&rsquo;ll lose money on or lose the deal over. Source the value and the repairs before you send a number.</div>
    </div>
  </div>
</section>

<!-- ==================== BACKEND ==================== -->
<section class="phase">
  <div class="phead">
    <div class="pnum">+</div>
    <div class="ptitle">
      <h2>What the War Room tracks</h2>
      <div class="pmeta">The stages, clocks and fields that run this board</div>
    </div>
  </div>
  <div class="pbody">
    <div class="tscroll">
      <table>
        <thead><tr><th>Stage</th><th>Clock / SLA</th><th>What must be true</th></tr></thead>
        <tbody>
          <tr><td>NEW (call &lt;5 min)</td><td class="num">5 min</td><td>Owner set, called, welcome text out.</td></tr>
          <tr><td>Qualify / process-call F/U</td><td class="num">same day</td><td>Property verified, listing status known.</td></tr>
          <tr><td>Appt set (process/offer call)</td><td class="num">&mdash;</td><td>Rapport + condition + motivation captured.</td></tr>
          <tr><td>Comp &rarr; offer</td><td class="num">24 hrs</td><td>Underwrite in 15 min; offer same day.</td></tr>
          <tr><td>Verbal offer (negotiate)</td><td class="num">ASAP</td><td>Cash + novation presented, off the ladder.</td></tr>
          <tr><td>Contract sent F/U</td><td class="num">72-hr offer</td><td>Agreed number in writing, walked line by line.</td></tr>
          <tr><td>Contract appt set (sign)</td><td class="num">&mdash;</td><td>Seller understands it; signing booked.</td></tr>
          <tr><td>Contract signed (&rarr; dispo)</td><td class="num">handoff</td><td>Type logged; buyer cascade armed.</td></tr>
        </tbody>
      </table>
    </div>

    <div class="note warn">
      <h4>Hard stops &mdash; these halt the deal, no exceptions</h4>
      <ul>
        <li>First call later than 5 minutes with no voicemail + text behind it.</li>
        <li>An offer sent on a value you can&rsquo;t source (no comps, no assessed figure).</li>
        <li>A contract sent and never walked through with the seller.</li>
        <li>Novation priced below the cash number (re-check &mdash; the math is wrong).</li>
        <li>A lead sitting in comp&rarr;offer more than one day.</li>
      </ul>
    </div>

    <div class="terms">
      <h3>Standing terms &mdash; not negotiable at the rep level</h3>
      <ol>
        <li><strong>Call in five.</strong> Speed is the product; the welcome text already promised it.</li>
        <li><strong>Offer the same day</strong> &mdash; within the hour. First-call offers are the goal.</li>
        <li><strong>One underwriting method.</strong> Same inputs, same number, every rep, every deal.</li>
        <li>All sellers and deal questions route to acquisitions:<br><span class="ph">(877) 652-8991</span></li>
      </ol>
    </div>
  </div>
</section>

<div class="ctl">
  <button class="reset" type="button">Clear all checks</button>
  <p>Checkboxes are a working run sheet for one lead and stay in this browser only. The War Room is the system of record.</p>
</div>

</div>

<script>
(function(){
  var KEY = "fo-acq-sop-v1";
  function load(){
    try { return JSON.parse(localStorage.getItem(KEY) || "{}"); }
    catch (e) { return {}; }
  }
  function save(state){
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  }
  var gates = Array.prototype.slice.call(document.querySelectorAll(".gate"));
  var state = load();
  function sync(gate){
    var boxes = Array.prototype.slice.call(gate.querySelectorAll("input[type=checkbox]"));
    var done = boxes.filter(function(b){ return b.checked; }).length;
    gate.querySelector("[data-count]").textContent = done + " / " + boxes.length;
    gate.setAttribute("data-clear", done === boxes.length ? "1" : "0");
  }
  gates.forEach(function(gate){
    var id = gate.getAttribute("data-gate");
    var boxes = Array.prototype.slice.call(gate.querySelectorAll("input[type=checkbox]"));
    boxes.forEach(function(box, i){
      box.id = id + "-" + i;
      if (state[box.id]) box.checked = true;
      box.addEventListener("change", function(){
        state[box.id] = box.checked;
        save(state);
        sync(gate);
      });
    });
    sync(gate);
  });
  document.querySelector("button.reset").addEventListener("click", function(){
    gates.forEach(function(gate){
      gate.querySelectorAll("input[type=checkbox]").forEach(function(box){
        box.checked = false;
        state[box.id] = false;
      });
      sync(gate);
    });
    save(state);
  });
})();
</script>

</body>
</html>
`;
export default HTML;
