import type { Metadata, Viewport } from "next";
import { AuthProvider } from "@/components/auth/auth-provider";
import { InstallProvider } from "@/components/pwa/install-provider";
import { ServiceWorkerRegistrar } from "@/components/pwa/service-worker-registrar";
import "./globals.css";

export const metadata: Metadata = {
  title: "PowerApp",
  description: "Comparador de tarifas eléctricas para brokers",
  appleWebApp: { capable: true, title: "PowerApp", statusBarStyle: "default" },
  icons: { apple: { url: "/icons/apple-touch-icon.png", sizes: "180x180" } },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F8FAFC" },
    { media: "(prefers-color-scheme: dark)", color: "#020617" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className="min-h-dvh font-sans antialiased">
        <ServiceWorkerRegistrar />
        <InstallProvider>
          <AuthProvider>{children}</AuthProvider>
        </InstallProvider>
      </body>
    </html>
  );
}
