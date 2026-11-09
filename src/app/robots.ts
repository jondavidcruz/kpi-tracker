import type { MetadataRoute } from "next";

// Private internal tool: tell every crawler to stay out entirely. Combined with the
// site-wide `robots: index:false` metadata, the War Room never appears in search.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", disallow: "/" },
  };
}
