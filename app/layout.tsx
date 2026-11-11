import type { Metadata } from "next";
import type { ReactNode } from "react";
import localFont from "next/font/local";
import { CartProvider } from "@/components/customer/CartContext";
import { getHomepageBanners } from "@/lib/data/banners";
import { ShopProvider } from "@/components/customer/ShopContext";
import FloatingCustomerChat from "@/components/chat/FloatingCustomerChat";
import "./globals.css";

// Existing font families are bundled locally; the condensed face styles navigation.
const openSans = localFont({ src: "../public/fonts/OpenSans-1.woff2", weight: "300 800", variable: "--font-open-sans", display: "swap" });
const inter = localFont({ src: "../public/fonts/Inter-1.woff2", weight: "400 700", variable: "--font-inter", display: "swap" });
const archivo = localFont({ src: "../public/fonts/Archivo-1.woff2", weight: "900", variable: "--font-archivo", display: "swap" });
const instrumentSans = localFont({ src: "../public/fonts/InstrumentSans-1.woff2", weight: "400", variable: "--font-instrument-sans", display: "swap" });
const condensed = localFont({ src: [
 { path: "../public/fonts/BarlowCondensed-1.woff2", weight: "400", style: "normal" },
 { path: "../public/fonts/BarlowCondensed-2.woff2", weight: "500", style: "normal" },
 { path: "../public/fonts/BarlowCondensed-3.woff2", weight: "600", style: "normal" },
 { path: "../public/fonts/BarlowCondensed-4.woff2", weight: "700", style: "normal" },
], variable: "--font-condensed", display: "swap" });

export const metadata: Metadata = {
  title: "LnR Cycle Center",
  description:
    "LnR Cycle Center — bicycle parts, custom bike builds and cycling event registration.",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const banners = await getHomepageBanners();
  return (
    <html
      lang="en"
      className={`${openSans.variable} ${inter.variable} ${archivo.variable} ${instrumentSans.variable} ${condensed.variable}`}
    >
      <body>
        <ShopProvider banners={banners}>
          <CartProvider>{children}<FloatingCustomerChat/></CartProvider>
        </ShopProvider>
      </body>
    </html>
  );
}
