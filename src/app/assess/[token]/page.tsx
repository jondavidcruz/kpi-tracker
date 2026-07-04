import { db } from "@/lib/db";
import AssessmentRunner from "@/components/AssessmentRunner";

export const dynamic = "force-dynamic";

// PUBLIC — no login. The unguessable token is the key, so a candidate can complete
// the assessment before they're in the system.
export default async function AssessPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const row = await db.assessment.findUnique({ where: { token } });

  if (!row) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <div className="text-4xl">🔗</div>
        <h1 className="mt-2 text-xl font-bold text-slate-800">Link not found</h1>
        <p className="mt-1 text-sm text-slate-500">This assessment link is invalid or has been removed. Please ask for a new one.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <AssessmentRunner token={token} name={row.name} doneWork={!!row.workStylesResult} doneWord={!!row.wordSurveyResult} />
    </div>
  );
}
