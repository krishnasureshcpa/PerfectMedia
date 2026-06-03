import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PerfectMedia",
  description: "Hollywood-grade AI media processing — conversion, dubbing, upscaling",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com"/>
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous"/>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet"/>
        <style>{`
          html,body,#__next{background:#08090E!important;color:#F0F4F8!important;}
          /* Force hardware acceleration for glass elements */
          .glass,.glass-strong{transform:translateZ(0);}
        `}</style>
      </head>
      <body>{children}</body>
    </html>
  );
}
