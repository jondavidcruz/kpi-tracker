// Maps each KPI (by stable key) to a line icon, replacing the stored emoji so
// the app reads like a portal, not a chat. Falls back to a neutral activity dot.
import {
  Phone, PhoneCall, MessageSquare, MessageCircle, UserPlus, Users, CalendarPlus,
  CalendarCheck, ClipboardCheck, FileText, FileCheck, FileSignature, Mic, Send,
  Calculator, Gauge, Megaphone, Mail, CircleDollarSign, DollarSign, Wallet,
  Receipt, Percent, TrendingUp, ArrowRightLeft, Inbox, Activity, Handshake,
  type LucideIcon,
} from "lucide-react";

const MAP: Record<string, LucideIcon> = {
  outbound_calls: Phone,
  connected_calls: PhoneCall,
  quality_convos: MessageSquare,
  leads_generated: UserPlus,
  leads_worked: UserPlus,
  leads_cc: Phone,
  appts_set: CalendarPlus,
  appts_taken: CalendarCheck,
  completed_process_calls: ClipboardCheck,
  passoffs: ArrowRightLeft,
  offers_made: FileText,
  contracts_assigned: Handshake,
  contracts_sent: FileText,
  contracts_signed: FileSignature,
  acq_talk_time: Mic,
  cc_talk_time: Mic,
  buyers_contacted: Users,
  new_buyers: UserPlus,
  buyer_offers_received: Inbox,
  deals_sold: Send,
  deals_comped: Calculator,
  deals_closed: CircleDollarSign,
  contracts_closed: FileCheck,
  internet_speed: Gauge,
  ppl_leads: Megaphone,
  text_responses: MessageCircle,
  direct_mail_responses: Mail,
  gross_revenue: DollarSign,
  marketing_spend: Wallet,
  operating_expenses: Receipt,
  cost_per_lead: Percent,
  roi: TrendingUp,
  net_margin: Percent,
};

export function KpiIcon({ kpiKey, size = 16, className = "" }: { kpiKey: string; size?: number; className?: string }) {
  const Icon = MAP[kpiKey] ?? Activity;
  return <Icon size={size} strokeWidth={1.75} className={className} aria-hidden />;
}

/** Inline label: icon + name, vertically centered. */
export function KpiLabel({ kpiKey, name, className = "" }: { kpiKey: string; name: string; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <KpiIcon kpiKey={kpiKey} className="shrink-0 text-slate-400" />
      <span>{name}</span>
    </span>
  );
}
