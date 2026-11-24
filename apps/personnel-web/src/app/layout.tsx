import type { Metadata } from "next";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeContext";
import { ToastProvider } from "@/components/Toast";

export const metadata: Metadata = {
  title: "KALASAG AI | Maps and Reports // Gumaca",
  description: "Authorized Maps and Reports Incident Operations & Management for Gumaca MDRRMO.",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="dark">
      <body>
        <ThemeProvider>
          <ToastProvider>
            {children}
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
