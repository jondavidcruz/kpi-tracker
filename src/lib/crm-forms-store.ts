import "server-only";
import { db } from "@/lib/db";
import { normalizeCustomField, type CustomFieldMap } from "@/lib/crm-forms";

// 🛠 Custom Home/Land Details fields live in Resource "__crm_custom_fields__"
// (description = JSON {formKey: rawField[]}) — no schema migration (Jon 2026-10-27).
const CAT = "__crm_custom_fields__";

export async function loadCustomFormFields(): Promise<CustomFieldMap> {
  try {
    const row = await db.resource.findFirst({ where: { category: CAT } });
    if (!row?.description) return {};
    const raw = JSON.parse(row.description) as Record<string, unknown[]>;
    const out: CustomFieldMap = {};
    for (const [formKey, arr] of Object.entries(raw)) {
      if (!Array.isArray(arr)) continue;
      const fields = arr.map(normalizeCustomField).filter((f): f is NonNullable<typeof f> => !!f);
      if (fields.length) out[formKey] = fields;
    }
    return out;
  } catch { return {}; }
}

/** Raw stored map (for the editor — keeps keys/options as saved). */
export async function loadCustomFieldsRaw(): Promise<Record<string, Record<string, unknown>[]>> {
  try {
    const row = await db.resource.findFirst({ where: { category: CAT } });
    if (!row?.description) return {};
    const raw = JSON.parse(row.description) as Record<string, Record<string, unknown>[]>;
    return raw && typeof raw === "object" ? raw : {};
  } catch { return {}; }
}

export async function saveCustomFieldsRaw(map: Record<string, Record<string, unknown>[]>): Promise<void> {
  const payload = JSON.stringify(map);
  const row = await db.resource.findFirst({ where: { category: CAT } });
  if (row) await db.resource.update({ where: { id: row.id }, data: { description: payload } });
  else await db.resource.create({ data: { title: "crm-custom-fields", category: CAT, url: "", description: payload } });
}
