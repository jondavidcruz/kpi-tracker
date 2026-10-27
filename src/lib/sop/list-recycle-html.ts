// 📜 Marketing SOP — Pull → Sift → Import → Dial → RECYCLE (Jon 2026-10-26). A standalone HTML
// doc served through /sop/list-recycle. The core ask: a repeatable system so marketing always
// knows WHEN a list is exhausted and it's time to pull a fresh one from DealMachine.
//
// NOTE on automation: Direct REI does NOT expose per-lead dial/attempt data to the War Room
// (its webhook only sends qualified / opted-out; the API has no call-log endpoints — call
// analytics are a CSV export only). So the recycle trigger below is a TEAM-RUN RULE, not an
// auto-detector. If Direct REI ever ships a call-log export/API, this becomes automatable.
const HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Marketing SOP — Pull, Dial & Recycle Lists</title>
<style>
  :root{--navy:#0b1f3a;--gold:#c9a227;--slate:#475569;--light:#94a3b8;--line:#e2e8f0}
  *{box-sizing:border-box}
  body{margin:0;background:#f1f5f9;color:#0f172a;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;line-height:1.55}
  .wrap{max-width:820px;margin:0 auto;padding:28px 18px 80px}
  .cover{background:var(--navy);color:#fff;border-radius:16px;padding:28px 28px 24px;border-bottom:5px solid var(--gold)}
  .kick{font-size:12px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:var(--gold)}
  h1{font-size:26px;margin:8px 0 4px}
  .sub{color:#cbd5e1;font-size:14px}
  .card{background:#fff;border-radius:14px;box-shadow:0 10px 30px -18px rgba(15,23,42,.25);padding:22px 26px;margin-top:18px}
  h2{font-size:17px;color:var(--navy);border-bottom:2px solid var(--line);padding-bottom:8px;margin:0 0 12px}
  h3{font-size:14px;color:var(--navy);margin:16px 0 6px}
  ol,ul{margin:8px 0 8px 2px;padding-left:20px}
  li{margin:5px 0}
  .pill{display:inline-block;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:800;background:#eef2ff;color:#3730a3}
  .box{border:1px solid var(--line);border-left:4px solid var(--gold);border-radius:10px;padding:12px 14px;margin:12px 0;background:#fffdf5}
  .danger{border-left-color:#ef4444;background:#fef2f2}
  .ok{border-left-color:#10b981;background:#ecfdf5}
  .big{font-size:15px;font-weight:700;color:var(--navy)}
  table{width:100%;border-collapse:collapse;margin:8px 0;font-size:13px}
  td,th{border:1px solid var(--line);padding:7px 9px;text-align:left;vertical-align:top}
  th{background:#f8fafc;color:var(--slate);font-size:11px;text-transform:uppercase;letter-spacing:.5px}
  code{background:#f1f5f9;border-radius:5px;padding:1px 6px;font-size:12px}
  .foot{color:var(--light);font-size:12px;margin-top:24px;text-align:center}
</style></head>
<body><div class="wrap">
  <div class="cover">
    <div class="kick">Freedom Offers · Marketing SOP</div>
    <h1>Pull → Sift → Import → Dial → Recycle</h1>
    <div class="sub">The repeatable loop for land-seller lists — and the rule for knowing exactly when a list is exhausted and it's time to pull a fresh one.</div>
  </div>

  <div class="card">
    <h2>The loop at a glance</h2>
    <ol>
      <li><b>Pull</b> a batch from DealMachine (1,000–2,000 at a time — not the whole month's 10k at once).</li>
      <li><b>Sift</b> the list clean before it ever touches Direct REI.</li>
      <li><b>Import</b> to Direct REI with the right field mapping + naming convention.</li>
      <li><b>Dial / text / email</b> the full touch cadence.</li>
      <li><b>Recycle</b> the moment the exhaustion rule trips — archive it, pull the next batch.</li>
    </ol>
    <div class="box"><span class="big">Why batches, not the whole 10k?</span> You can pull 10,000/month with DealMachine. Pulling 1–2k at a time means you always have a <b>fresh, un-worked list ready</b> the day the current one dies — no gap, no scrambling.</div>
  </div>

  <div class="card">
    <h2>1 · Pull the list <span class="pill">DealMachine</span></h2>
    <ul>
      <li><b>Anchor the market to your buyers.</b> Pull where vetted developers/agents actually buy (TX, Nashville, FL, CA per the current buyer map). A list with no buyer behind it is wasted dials.</li>
      <li><b>Filters:</b> vacant land · owner individual/trust (exclude business) · 5+ years owned (include "unknown") · not currently listed · lot size matching the buy box · optionally out-of-state owners or tax-delinquent as a split test.</li>
      <li><b>Batch size:</b> 1,000–2,000 per pull. Export CSV: owner name, mailing + property address, county, lot size, APN.</li>
    </ul>
  </div>

  <div class="card">
    <h2>2 · Sift the list clean</h2>
    <ul>
      <li><b>Dedupe</b> by owner and by phone — one owner, one record.</li>
      <li><b>DNC / opt-out scrub</b> — drop anyone already on the War Room DNC or previously opted out. (Direct REI opt-outs flow into the War Room DNC automatically.)</li>
      <li><b>Format for Direct REI</b> — phone as 10 digits, name split if needed, APN kept as the deal code.</li>
      <li><b>Skip-trace</b> (Direct REI / Skipmatrix) for any missing phones before load.</li>
    </ul>
  </div>

  <div class="card">
    <h2>3 · Import to Direct REI</h2>
    <ul>
      <li><b>Naming convention (do this every time):</b> <code>LAND-[MARKET]-[MMDD]</code> — e.g. <code>LAND-POLK-FL-1104</code>. The date is how you know a list's age at a glance (see the recycle rule).</li>
      <li>Map fields: property address, owner name, phone, APN → the deal/offer code.</li>
      <li>Keep land lists in their <b>own campaign</b>, separate from house leads, so KPIs stay clean.</li>
      <li>Set the opener (conversational, not scripted) and route replies into the LAND pipeline.</li>
    </ul>
  </div>

  <div class="card">
    <h2>4 · Work the list — the touch cadence</h2>
    <p>Every lead gets the <b>full cadence</b> before it counts as "worked." Hunter/John's method runs roughly:</p>
    <table>
      <tr><th>Day</th><th>Touch</th></tr>
      <tr><td>1</td><td>SMS opener + first dial pass</td></tr>
      <tr><td>2–3</td><td>Dial pass #2 · follow-up text to no-replies</td></tr>
      <tr><td>5–7</td><td>Dial pass #3 · email (where available)</td></tr>
      <tr><td>10–12</td><td>Dial pass #4 · "breakup" text</td></tr>
      <tr><td>14</td><td>Final dial pass #5–6</td></tr>
    </table>
    <p>That's ~<b>6 touch attempts across ~2 weeks</b>. Direct mail non-responders get a second mailer at day 60–90 (calendar it).</p>
  </div>

  <div class="card">
    <h2>5 · RECYCLE — the exhaustion rule <span class="pill">the system</span></h2>
    <p class="big">A list is <b>exhausted</b> — pull a fresh one — when ANY of these is true:</p>
    <div class="box danger">
      <ul>
        <li><b>Connect rate collapses:</b> the remaining un-worked leads are just hitting voicemail — <b>fewer than ~5% new connects for 2 straight dial sessions.</b> (This is Jon's exact signal: "90 answered, the last 10 keep going to voicemail → done.")</li>
        <li><b>Coverage done:</b> <b>≥ 80% of the list is dispositioned</b> — responded (interested or not), opted out, or hit the full ~6-attempt cadence with no contact.</li>
        <li><b>Age:</b> the list is <b>~3 weeks old</b> (check the <code>MMDD</code> in the campaign name). Past that, the juice is gone — a fresh pull beats re-flogging a dead one.</li>
      </ul>
    </div>
    <div class="box ok"><span class="big">When it trips →</span> archive the Direct REI campaign, log it in the recycle tracker, and <b>pull the next 1–2k batch from DealMachine</b> (you've always got a fresh one staged from step 1).</div>

    <h3>Keep a one-line log per list</h3>
    <p>Until the War Room can read Direct REI's dial data directly, track each list by hand — a shared sheet or the recycle tracker:</p>
    <table>
      <tr><th>List name</th><th>Pulled</th><th># pulled</th><th># responded</th><th>Recycled on</th></tr>
      <tr><td>LAND-POLK-FL-1104</td><td>11/04</td><td>1,500</td><td>— (update weekly)</td><td>—</td></tr>
    </table>

    <div class="box"><b>Heads-up (why this is a rule, not an alarm yet):</b> Direct REI only tells the War Room about <i>qualified</i> and <i>opted-out</i> contacts — it does <b>not</b> send per-lead dial/voicemail counts (those are a CSV export inside Direct REI). So the exhaustion call is the team watching the connect rate in Direct REI against the rule above. If Direct REI adds a call-log export, we can automate the alert.</div>
  </div>

  <div class="card">
    <h2>6 · Capacity math (so nobody panics)</h2>
    <ul>
      <li>DealMachine: <b>~10,000 pulls/month</b> → that's ~5–8 batches of 1,500.</li>
      <li>A single $10k assignment funds a <b>lot</b> of dials/mail — volume isn't the constraint, working each list fully <b>is</b>.</li>
      <li>First batch in a new market may produce zero deals — normal. The list + the offer price learn with each round.</li>
    </ul>
  </div>

  <div class="foot">Freedom Offers · Marketing SOP · recycle on the rule, not on a hunch.</div>
</div></body></html>`;

export default HTML;
