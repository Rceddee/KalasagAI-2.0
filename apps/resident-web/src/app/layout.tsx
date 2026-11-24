import type { Metadata, Viewport } from "next";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";
import { ThemeProvider } from "@/components/ThemeContext";
import { ToastProvider } from "@/components/Toast";

export const metadata: Metadata = {
  title: "KALASAG AI | Gumaca Incident Reporter",
  description: "Official Emergency Incident Reporting & Public Hazard Map for Gumaca Residents.",
  applicationName: "KALASAG AI Resident",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "KALASAG AI" },
  manifest: "/manifest.webmanifest",
  icons: { icon: "/favicon.ico", apple: "/favicon.ico" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0A0D10",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="light">
      <body>
        <ThemeProvider>
          <ToastProvider>
            <AuthProvider>{children}</AuthProvider>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
