import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

// Generated app icon: gold "FO" on brand navy. Used for the PWA / home-screen.
export default function Icon() {
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
          fontSize: 280,
          fontWeight: 900,
        }}
      >
        FO
      </div>
    ),
    { ...size },
  );
}
