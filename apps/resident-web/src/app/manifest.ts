import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "KalasagAI Resident",
    short_name: "KalasagAI",
    description: "Secure emergency incident reporting and tracking.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#f4f8fc",
    theme_color: "#0c2a43",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
