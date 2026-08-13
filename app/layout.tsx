import type { Metadata, Viewport } from "next";
import "./globals.css";

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "Chroma";

export const metadata: Metadata = {
  title: `${APP_NAME} — spending, organised by colour`,
  description:
    "Chroma turns your LOOP transactions into colour-coded Boards, with budgets and AI insights. Built for the UNLEASH LOOP </DEV> Hackathon.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f9f9f7" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0d0d" },
  ],
};

/**
 * Runs before paint so a stored theme choice doesn't flash the wrong mode.
 * No stored choice means no attribute, which lets the OS preference win.
 */
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("chroma-theme");if(t==="dark"||t==="light"){document.documentElement.setAttribute("data-theme",t)}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <div className="aurora" aria-hidden="true">
          <span />
        </div>
        {children}
      </body>
    </html>
  );
}
