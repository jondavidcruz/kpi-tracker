// The app's public base URL, used in outbound email links. When the domain
// changes, set APP_URL in Vercel (e.g. https://warroom.freedom-offers.com) and
// every email link follows — no code change needed.
export const APP_URL = (process.env.APP_URL ?? "https://kpi-tracker-lovat.vercel.app").replace(/\/+$/, "");
