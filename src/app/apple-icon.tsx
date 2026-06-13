import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// iOS home-screen icon (Add to Home Screen).
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0b1f3a",
          color: "#e7b94f",
          fontSize: 100,
          fontWeight: 900,
        }}
      >
        FO
      </div>
    ),
    { ...size },
  );
}
