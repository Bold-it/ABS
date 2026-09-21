import type { Metadata } from "next";
import "./globals.css";
import { GoogleOAuthProvider } from '@react-oauth/google';

export const metadata: Metadata = {
  title: "HTU ABS BRIDGE — Automation Console",
  description: "Auto Bridge Service Automation Console for Ho Technical University",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="h-full antialiased font-sans"
    >
      <body className="min-h-full flex flex-col">
        <GoogleOAuthProvider clientId={process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || ""}>
          {children}
        </GoogleOAuthProvider>
      </body>
    </html>
  );
}
