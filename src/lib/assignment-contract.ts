// 📄 Assignment Contract auto-draft (Jon 2026-10-22). After we get offers and hand
// the best one to the seller, the deal closes by ASSIGNING our purchase contract to
// the end buyer for an assignment fee. This builds that document straight from the
// deal's own numbers (seller price, best buyer offer → our fee) so the girls don't
// retype anything. Stored on the opp (CrmOpportunity.formData.__assignmentDraft) —
// no schema migration. Pure + client-safe: types, compute + text builder only.
//
// ⚠️ This generates a DRAFT for internal use + attorney review. It is not legal
// advice and the contract text is a starting template, not a substitute for counsel.

export type AssignmentInputs = {
  assignorEntity: string;   // us — the current contract holder
  assignorSigner: string;   // who signs for us
  assigneeName: string;     // the end buyer / developer taking the contract
  assigneeEntity: string;   // their entity, if any
  assigneeEmail: string;
  propertyAddress: string;
  apn: string;
  county: string;
  state: string;
  acres: string;
  purchasePrice: number;    // the price in our contract with the seller (what we pay the seller)
  assignmentFee: number;    // our spread — what the assignee pays US on top
  emd: number;              // earnest / assignment deposit from the assignee (non-refundable)
  closingDays: number;      // days to close from effective date
  titleCompany: string;
  effectiveDate: string;    // YYYY-MM-DD
};

export type AssignmentDraft = AssignmentInputs & {
  generatedAt?: string;     // ISO when last generated
  generatedBy?: string;
  text?: string;            // the rendered contract
  pandadocId?: string;      // PandaDoc document id once sent for signature
  shareLink?: string;       // recipient signing link (textable via Telnyx)
  sentAt?: string;          // ISO when sent for signature
};

export function money(n: number): string {
  return `$${Math.round(n || 0).toLocaleString("en-US")}`;
}

/** Spelled-out dollars for a contract line, e.g. 145000 → "One Hundred Forty-Five Thousand and 00/100 Dollars". */
export function moneyWords(n: number): string {
  const v = Math.round(n || 0);
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const three = (num: number): string => {
    let s = "";
    const h = Math.floor(num / 100);
    const r = num % 100;
    if (h) s += ones[h] + " Hundred" + (r ? " " : "");
    if (r < 20) s += ones[r];
    else { s += tens[Math.floor(r / 10)]; if (r % 10) s += "-" + ones[r % 10]; }
    return s;
  };
  if (v === 0) return "Zero and 00/100 Dollars";
  const scales = ["", " Thousand", " Million", " Billion"];
  const parts: string[] = [];
  let rem = v, i = 0;
  while (rem > 0 && i < scales.length) {
    const chunk = rem % 1000;
    if (chunk) parts.unshift(three(chunk) + scales[i]);
    rem = Math.floor(rem / 1000);
    i++;
  }
  return parts.join(" ").trim() + " and 00/100 Dollars";
}

function fmtDate(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd || "");
  if (!m) return ymd || "____________";
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

/** The assignee's all-in = the seller-contract price + our assignment fee. */
export function assigneeAllIn(inp: Pick<AssignmentInputs, "purchasePrice" | "assignmentFee">): number {
  return (inp.purchasePrice || 0) + (inp.assignmentFee || 0);
}

/** Read + normalize a stored draft off an opp's formData (never throws). */
export function readAssignmentDraft(formData: unknown): AssignmentDraft | null {
  const raw = (formData as Record<string, unknown> | null)?.__assignmentDraft;
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const num = (k: string) => { const n = Number(String(r[k] ?? "").replace(/[$,\s]/g, "")); return Number.isFinite(n) ? n : 0; };
  const str = (k: string) => (r[k] != null ? String(r[k]) : "");
  return {
    assignorEntity: str("assignorEntity"), assignorSigner: str("assignorSigner"),
    assigneeName: str("assigneeName"), assigneeEntity: str("assigneeEntity"), assigneeEmail: str("assigneeEmail"),
    propertyAddress: str("propertyAddress"), apn: str("apn"), county: str("county"), state: str("state"), acres: str("acres"),
    purchasePrice: num("purchasePrice"), assignmentFee: num("assignmentFee"), emd: num("emd"),
    closingDays: num("closingDays") || 30, titleCompany: str("titleCompany"), effectiveDate: str("effectiveDate"),
    generatedAt: r.generatedAt ? String(r.generatedAt) : undefined,
    generatedBy: r.generatedBy ? String(r.generatedBy) : undefined,
    text: r.text ? String(r.text) : undefined,
    pandadocId: r.pandadocId ? String(r.pandadocId) : undefined,
    shareLink: r.shareLink ? String(r.shareLink) : undefined,
    sentAt: r.sentAt ? String(r.sentAt) : undefined,
  };
}

/** Build the assignment-agreement text from the inputs. Deterministic + printable. */
export function buildAssignmentContract(i: AssignmentInputs): string {
  const allIn = assigneeAllIn(i);
  const assignee = i.assigneeEntity?.trim() ? `${i.assigneeEntity.trim()}${i.assigneeName.trim() ? ` (attn: ${i.assigneeName.trim()})` : ""}` : (i.assigneeName.trim() || "____________________");
  const propLine = [i.propertyAddress.trim(), i.county.trim() ? `${i.county.trim()} County` : "", i.state.trim()].filter(Boolean).join(", ") || "____________________";
  const L: string[] = [];
  L.push("ASSIGNMENT OF REAL ESTATE PURCHASE AND SALE AGREEMENT");
  L.push("");
  L.push(`This Assignment of Real Estate Purchase and Sale Agreement (this "Assignment") is made and entered into as of ${fmtDate(i.effectiveDate)} (the "Effective Date"), by and between:`);
  L.push("");
  L.push(`  ASSIGNOR:  ${i.assignorEntity || "Freedom Offers LLC"}`);
  L.push(`  ASSIGNEE:  ${assignee}`);
  if (i.assigneeEmail.trim()) L.push(`             ${i.assigneeEmail.trim()}`);
  L.push("");
  L.push("RECITALS");
  L.push("");
  L.push(`A. Assignor is the "Buyer" under that certain Real Estate Purchase and Sale Agreement (the "Purchase Agreement") for the real property commonly described as ${propLine}${i.apn.trim() ? `, APN ${i.apn.trim()}` : ""}${i.acres.trim() ? `, consisting of approximately ${i.acres.trim()} acres` : ""} (the "Property").`);
  L.push(`B. Under the Purchase Agreement, the agreed purchase price for the Property is ${moneyWords(i.purchasePrice)} (${money(i.purchasePrice)}).`);
  L.push(`C. Assignor desires to assign all of its rights, title, and interest in and to the Purchase Agreement to Assignee, and Assignee desires to accept such assignment, on the terms set forth below.`);
  L.push("");
  L.push("NOW, THEREFORE, for good and valuable consideration, the receipt and sufficiency of which are hereby acknowledged, the parties agree as follows:");
  L.push("");
  L.push(`1. ASSIGNMENT. Assignor hereby assigns, transfers, and sets over to Assignee all of Assignor's rights, title, and interest in, to, and under the Purchase Agreement, including the right to purchase the Property thereunder.`);
  L.push("");
  L.push(`2. ASSIGNMENT FEE. In consideration of this Assignment, Assignee shall pay Assignor a non-refundable assignment fee of ${moneyWords(i.assignmentFee)} (${money(i.assignmentFee)}) (the "Assignment Fee"). The Assignment Fee is earned by Assignor upon execution of this Assignment and shall be paid at or before the closing of the purchase of the Property.`);
  L.push("");
  L.push(`3. EARNEST MONEY / DEPOSIT. Upon execution of this Assignment, Assignee shall deposit ${moneyWords(i.emd)} (${money(i.emd)}) with ${i.titleCompany.trim() || "the closing agent / title company"} (the "Deposit"), to be applied toward the Assignment Fee at closing. The Deposit is non-refundable except in the event the Purchase Agreement is terminated by the Seller or for a title defect that cannot be cured.`);
  L.push("");
  L.push(`4. ASSUMPTION. Assignee hereby assumes and agrees to perform all of the obligations of the Buyer under the Purchase Agreement arising from and after the Effective Date, including payment of the purchase price of ${money(i.purchasePrice)} to the Seller at closing. Assignee's total consideration for the Property is therefore ${money(allIn)} (purchase price ${money(i.purchasePrice)} + Assignment Fee ${money(i.assignmentFee)}).`);
  L.push("");
  L.push(`5. CLOSING. The purchase of the Property shall close on or before ${i.closingDays || 30} days from the Effective Date, through ${i.titleCompany.trim() || "a title company / closing agent mutually acceptable to the parties"}. Assignee shall be responsible for its own closing costs unless otherwise provided in the Purchase Agreement.`);
  L.push("");
  L.push(`6. REPRESENTATIONS. Assignor represents that the Purchase Agreement is in full force and effect and that Assignor has not previously assigned its interest therein. Assignor makes no representations or warranties as to the condition of the Property, title, zoning, access, utilities, or suitability for any purpose, and Assignee is acquiring the Purchase Agreement on an "AS-IS, WHERE-IS" basis. Assignee acknowledges it has had the opportunity to perform its own due diligence.`);
  L.push("");
  L.push(`7. ENTIRE AGREEMENT. This Assignment constitutes the entire agreement between the parties with respect to its subject matter and may be amended only in a writing signed by both parties. This Assignment shall be governed by the laws of the State of ${i.state.trim() || "____"}. This Assignment may be executed in counterparts and by electronic signature, each of which shall be deemed an original.`);
  L.push("");
  L.push("IN WITNESS WHEREOF, the parties have executed this Assignment as of the Effective Date.");
  L.push("");
  L.push("ASSIGNOR:");
  L.push("");
  L.push(`${i.assignorEntity || "Freedom Offers LLC"}`);
  L.push("");
  L.push(`By: ______________________________    Date: ____________`);
  L.push(`Name: ${i.assignorSigner.trim() || "____________________"}`);
  L.push("");
  L.push("ASSIGNEE:");
  L.push("");
  L.push(`${i.assigneeEntity.trim() || i.assigneeName.trim() || "____________________"}`);
  L.push("");
  L.push(`By: ______________________________    Date: ____________`);
  L.push(`Name: ${i.assigneeName.trim() || "____________________"}`);
  L.push("");
  L.push("—");
  L.push("DRAFT generated by the Freedom Offers War Room for internal use and attorney review. This is not legal advice. Have a licensed attorney in the property's state review before sending for signature.");
  return L.join("\n");
}
