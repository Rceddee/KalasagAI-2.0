import "./globals.css";
import { ThemeProvider } from "@/components/ThemeContext";

export const metadata = {
  title: "KalasagAI — MDRRMO Command Center",
  description:
    "AI-powered emergency incident reporting and classification dashboard for KALASAG MDRRMO, Municipality of Gumaca, Quezon. Real-time monitoring, NLP classification, and digital blotter generation.",
  keywords: "KALASAG, MDRRMO, Gumaca, Quezon, incident reporting, NLP, emergency management",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: "try { var theme = localStorage.getItem('kalasag_theme'); document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light'); } catch (e) { document.documentElement.setAttribute('data-theme', 'light'); }",
          }}
        />
        <link
          rel="stylesheet"
          href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
          integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
          crossOrigin=""
        />
      </head>
      <body><ThemeProvider>{children}</ThemeProvider></body>
    </html>
  );
}
