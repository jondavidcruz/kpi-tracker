import { db } from "@/lib/db";

// 🎫 Ticket chat threads (iSpeedToLead-style support chat, Jon 2026-10-08).
// One Resource row (__ticket_chat__) holds every ticket's message list —
// no migration needed, volumes are tiny (team of 7).
export type TicketMsg = { by: string; at: string; text: string; kind?: "msg" | "ack" | "escalation" };

const CAT = "__ticket_chat__";

async function readAll(): Promise<Record<string, TicketMsg[]>> {
  const row = await db.resource.findFirst({ where: { category: CAT } }).catch(() => null);
  if (!row?.description) return {};
  try { return JSON.parse(row.description) as Record<string, TicketMsg[]>; } catch { return {}; }
}

export async function readTicketChats(): Promise<Record<string, TicketMsg[]>> {
  return readAll();
}

export async function appendTicketMsg(ticketId: string, msg: TicketMsg): Promise<void> {
  const all = await readAll();
  const list = all[ticketId] ?? [];
  list.push(msg);
  all[ticketId] = list.slice(-50); // cap per ticket
  const row = await db.resource.findFirst({ where: { category: CAT } });
  const description = JSON.stringify(all);
  if (row) await db.resource.update({ where: { id: row.id }, data: { description } });
  else await db.resource.create({ data: { title: "ticket-chat", category: CAT, url: "", description } });
  // bump the ticket's updatedAt so "last message" sorts correctly
  await db.ticket.update({ where: { id: ticketId }, data: { updatedAt: new Date() } }).catch(() => {});
}

export function escalationCount(msgs: TicketMsg[]): number {
  return msgs.filter((m) => m.kind === "escalation").length;
}

export const AUTO_ACK: Omit<TicketMsg, "at"> = {
  by: "War Room Support",
  kind: "ack",
  text: "Hello! Thank you for reaching out — we've received your ticket and it's already in the review queue. Claude triages every weekday morning at 8:30am and Jon approves what gets fixed. You'll see every update right here in this thread, so there's no need to resubmit. 🙏",
};
