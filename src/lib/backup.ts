import { db } from "@/lib/db";

// Full export of every War Room table as one JSON object. Used by the on-demand
// admin download and the nightly emailed backup. (Software secrets are stored
// encrypted, so they're ciphertext here too.)
export async function buildBackup() {
  const [
    user, kpi, target, entry, alert, pip, ticket, closedDeal, resource, monthlyMetric,
    callScore, teamProfile, weeklyAward, callScript, suggestion, deal, settings,
    meetingRecording, meetingNote, changeRequest, changeComment, aiSubmission, rock,
    marketContact, targetMarket, roadmapItem, software, secretAccess, seat, vto, issue,
    toDo, trainingTip, timeOff, punch,
  ] = await Promise.all([
    db.user.findMany(), db.kpi.findMany(), db.target.findMany(), db.entry.findMany(),
    db.alert.findMany(), db.pip.findMany(), db.ticket.findMany(), db.closedDeal.findMany(),
    db.resource.findMany(), db.monthlyMetric.findMany(), db.callScore.findMany(),
    db.teamProfile.findMany(), db.weeklyAward.findMany(), db.callScript.findMany(),
    db.suggestion.findMany(), db.deal.findMany(), db.settings.findMany(),
    db.meetingRecording.findMany(), db.meetingNote.findMany(), db.changeRequest.findMany(),
    db.changeComment.findMany(), db.aiSubmission.findMany(), db.rock.findMany(),
    db.marketContact.findMany(), db.targetMarket.findMany(), db.roadmapItem.findMany(),
    db.software.findMany(), db.secretAccess.findMany(), db.seat.findMany(), db.vto.findMany(),
    db.issue.findMany(), db.toDo.findMany(), db.trainingTip.findMany(), db.timeOff.findMany(),
    db.punch.findMany(),
  ]);

  const tables = {
    user, kpi, target, entry, alert, pip, ticket, closedDeal, resource, monthlyMetric,
    callScore, teamProfile, weeklyAward, callScript, suggestion, deal, settings,
    meetingRecording, meetingNote, changeRequest, changeComment, aiSubmission, rock,
    marketContact, targetMarket, roadmapItem, software, secretAccess, seat, vto, issue,
    toDo, trainingTip, timeOff, punch,
  };
  const counts = Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, (v as unknown[]).length]));
  const totalRows = Object.values(counts).reduce((a, b) => a + (b as number), 0);

  return { app: "Freedom Offers War Room", generatedAt: new Date().toISOString(), totalRows, counts, tables };
}
