-- Developer/luxury outreach KPIs for dispositions (shown on a developer-focus day).
INSERT INTO "Kpi" ("id","key","name","emoji","category","unit","scope","roleKey","cadence","goalValue","goalKind","computed","definition","sortOrder","active") VALUES
  ('kpi_dev_ig','dev_instagram','Instagram Outreach','📷','blue','count','per_rep','dispositions','daily',10,'at_least',false,'Personalized DMs to developers on Instagram.',90,true),
  ('kpi_dev_li','dev_linkedin','LinkedIn Outreach','💼','blue','count','per_rep','dispositions','daily',8,'at_least',false,'Personalized outreach to developers on LinkedIn.',91,true),
  ('kpi_dev_web','dev_website','Website Inquiries','🌐','blue','count','per_rep','dispositions','daily',5,'at_least',false,'Inquiries sent via developer/company websites.',92,true),
  ('kpi_dev_wom','dev_wordofmouth','Word-of-Mouth Intros','🤝','blue','count','per_rep','dispositions','daily',1,'at_least',false,'Warm developer intros via word of mouth.',93,true),
  ('kpi_dev_conv','dev_conversations','Developer Conversations','💬','blue','count','per_rep','dispositions','daily',2,'at_least',false,'Real conversations / meetings with developers (the result).',94,true)
ON CONFLICT ("key") DO NOTHING;
