import type { Metadata } from "next";
import { Open_Sans, Inter, Archivo, Instrument_Sans } from "next/font/google";
import { CartProvider } from "@/components/customer/CartContext";
import { getHomepageBanners } from "@/lib/data/banners";
import { ShopProvider } from "@/components/customer/ShopContext";
import FloatingCustomerChat from "@/components/chat/FloatingCustomerChat";
import "./globals.css";

// Design reference (Figma "Admin Page Prototype") uses the Open Sans family.
const openSans = Open_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  variable: "--font-open-sans",
  display: "swap",
});

// Fonts used by the customer-facing storefront sections (e.g. the
// "Build Your Own Custom Bike" promo block). Loaded alongside Open Sans;
// existing admin sections keep using --font-sans and are unaffected.
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

const archivo = Archivo({
  subsets: ["latin"],
  weight: ["900"],
  variable: "--font-archivo",
  display: "swap",
});

const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-instrument-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "LnR Cycle Center",
  description:
    "LnR Cycle Center — bicycle parts, custom bike builds and cycling event registration.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const banners = await getHomepageBanners();
  return (
    <html
      lang="en"
      className={`${openSans.variable} ${inter.variable} ${archivo.variable} ${instrumentSans.variable}`}
    >
      <body>
        <ShopProvider banners={banners}>
          <CartProvider>{children}<FloatingCustomerChat/></CartProvider>
        </ShopProvider>
      </body>
    </html>
  );
}
