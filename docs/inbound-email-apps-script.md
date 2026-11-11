# Inbound-email reply → War Room (free, no Zapier)

This Google Apps Script watches the **info@freedom-offers.com** inbox and forwards new seller
**replies** to the War Room, which then stops the drip, moves the lead forward (price → Comp/Offer,
else → Follow Up), and drops a "call them now" task. It runs every 5 minutes on a free Google
trigger — no DNS change, Gmail keeps working exactly as-is.

## Setup (one-time, ~5 minutes)

1. Sign in to **script.google.com** as **info@freedom-offers.com** (the shared inbox).
2. **New project** → delete the sample code → paste the script below.
3. At the top of the script, set `SECRET` to the War Room's `CRON_SECRET` value.
   (It's already an env var in Vercel — reuse the same string. Don't paste it anywhere public.)
4. Click **Save**, then **Run** once (`syncReplies`) and approve the Google permission prompt.
5. Left sidebar → **Triggers** (clock icon) → **Add Trigger**:
   - Function: `syncReplies`
   - Event source: **Time-driven** → **Minutes timer** → **Every 5 minutes** → Save.

That's it. New replies flow in automatically. To test: reply to one of your own drip emails from a
different account and watch it appear on that lead's timeline in Conversations within ~5 min.

## The script

```javascript
// ── Freedom Offers — inbound email reply → War Room ────────────────────────────
var SECRET   = 'PASTE_YOUR_CRON_SECRET_HERE';            // = Vercel CRON_SECRET
var ENDPOINT = 'https://kpi-tracker-lovat.vercel.app/api/email/inbound';
var LABEL    = 'WR-Synced';                              // applied so we never re-send a message

function syncReplies() {
  var label = GmailApp.getUserLabelByName(LABEL) || GmailApp.createLabel(LABEL);
  // Unread-or-recent inbound threads we haven't synced yet (last ~1 day keeps it light).
  var threads = GmailApp.search('in:inbox newer_than:1d -label:' + LABEL, 0, 40);
  var me = Session.getActiveUser().getEmail().toLowerCase();

  threads.forEach(function (thread) {
    var msgs = thread.getMessages();
    var last = msgs[msgs.length - 1];                    // newest message in the thread
    var from = (last.getFrom() || '').toLowerCase();
    // Skip anything WE sent (our own address / domain) — we only forward the seller's reply.
    if (from.indexOf(me) !== -1 || from.indexOf('freedom-offers.com') !== -1) {
      thread.addLabel(label);
      return;
    }
    var payload = {
      from:    last.getFrom(),
      subject: last.getSubject(),
      text:    last.getPlainBody().slice(0, 4000),
      message_id: last.getId(),
    };
    try {
      UrlFetchApp.fetch(ENDPOINT + '?key=' + encodeURIComponent(SECRET), {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify(payload),
        muteHttpExceptions: true,
      });
      thread.addLabel(label);                            // mark done so it's never double-sent
    } catch (e) {
      // leave it unlabeled so the next run retries
    }
  });
}
```

## Notes
- The War Room de-dupes on `message_id`, so an accidental double-send is harmless.
- Only the **seller's** reply is forwarded — messages from our own addresses are skipped.
- A reply ALWAYS stops that lead's sequence and hands them to a human; nothing auto-replies.
- If you ever rotate `CRON_SECRET`, update `SECRET` here too.
