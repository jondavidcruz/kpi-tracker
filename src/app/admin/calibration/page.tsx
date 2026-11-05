import { redirect } from "next/navigation";

// 🎯 Underwriting Calibration moved into /underwriting (Jon 2026-11-04) so it lives with the
// calculator and only tracks signed deals. This route now just forwards there.
export default function CalibrationRedirect() {
  redirect("/underwriting#calibration");
}
