# The ask to send your DirectREI friend

Two versions — a quick text, and a fuller email. Attach `directrei-integration-spec.md`
to the email (that's the technical detail for his dev side).

---

## 📱 Text / DM version (casual)

> Hey — quick one. I run my whole operation now out of a custom CRM (the "War Room").
> I already pull data FROM DirectREI into it. What I want next: when my team is ready to
> blast a deal to our vetted buyers, I click one button in my CRM and it fires the
> campaign through YOUR dialer/email/SMS automations — so we're not rebuilding the buyer
> list by hand in DirectREI every time.
>
> To do that I just need a few write endpoints on your API: create a campaign, add
> contacts to it, launch it, and a webhook that pings me back when a buyer replies/opens/
> gets called. Bonus: if your site builder can spin up a deal landing page by API, I'd
> auto-generate the buyer "deal room" too.
>
> My dev already built my side to match — it's basically plug-and-play once your endpoints
> exist. I'll send you a one-page spec. Can you take a look / tell me what's possible?

---

## 📧 Email version

**Subject:** Hooking my CRM into DirectREI — a few API endpoints?

Hey [name],

Hope you're doing well. Quick ask on the DirectREI side.

I've moved my whole wholesaling operation onto a custom CRM we built (we call it the War
Room). It already reads from DirectREI — contacts, campaigns, deals — to power our
dashboards and reply tracking.

The next step would save my dispo team a ton of manual work. Right now, when a deal is
ready to go out to buyers, someone has to open DirectREI, build a campaign, re-add the
buyer list, write the message, and launch it — even though that whole buyer list and the
deal already live in my CRM. I want to make it **one click**: my team reviews the deal,
clicks "launch blast," and it fires the campaign through your existing dialer / email /
SMS automations (which are great — I don't want to rebuild any of that).

To do that, I'd need a few **write** endpoints on your API (we already use the same key
for reads):

1. **Create a campaign** — name, which channels (SMS / email / cold call), and the message.
2. **Add contacts to a campaign** — my matched buyer list, each tagged with my own id so
   you can hand it back to me later.
3. **Launch the campaign** — kick off your automations.
4. **A webhook back to me** — one ping per buyer event (sent / delivered / opened /
   replied / call outcome), so replies land in my CRM instead of me babysitting the
   DirectREI inbox. This is the piece that makes it two-way.
5. **(Bonus)** If your website builder can be driven by API, I'd auto-generate a public
   "deal room" landing page per property with a make-an-offer form.

My developer already built my side to a clean spec, so this should be close to
plug-and-play once your endpoints exist — I've attached that one-page spec for your dev
(field names are just suggestions; we'll map to whatever you've got).

Could you take a look and let me know what's feasible and any rough timing? Happy to hop
on a call. Really appreciate it.

Thanks,
Jon

*(Attachment: directrei-integration-spec.md)*
