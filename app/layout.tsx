import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "THOR | Inventario y ventas",
  description: "Control de inventario, ventas y caja para THOR.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

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
