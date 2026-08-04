import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "thor.local";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "https";
  const origin = `${protocol}://${host}`;

  return {
    title: "THOR | Inventario y ventas",
    description: "Control de inventario, ventas y caja para THOR.",
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
    openGraph: {
      title: "THOR | Inventario y ventas",
      description: "Inventario y ventas, bajo control.",
      images: [{ url: `${origin}/og.png`, width: 1800, height: 1000 }],
    },
    twitter: { card: "summary_large_image", images: [`${origin}/og.png`] },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
