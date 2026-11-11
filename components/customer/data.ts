/**
 * Static content for the customer-facing homepage.
 *
 * All image files are provided in /public/Customerpageimages. File names
 * containing spaces are URL-encoded (%20) in the src paths below.
 *
 * Note: product data (names, prices, images, stock) is no longer defined here —
 * it is served live from the Supabase catalog via lib/products.ts so the
 * storefront and the admin panel always stay in sync.
 */

export const HEADER_LOGO_SRC = "/assets/brand/logo-header.png";
export const FOOTER_LOGO_SRC = "/assets/brand/logo-footer.png";
// Kept for components outside the storefront that still expect the original constant.
export const LOGO_SRC = HEADER_LOGO_SRC;

/**
 * Shown on product cards / detail pages when a product has no image rows yet
 * (e.g. products added before an image was uploaded).
 */
export const PRODUCT_PLACEHOLDER_SRC = "/assets/brand/13434972.png";

export type HeroSlide = {
  src: string;
  alt: string;
};

export const HERO_SLIDES: HeroSlide[] = [
  {
    src: "/Customerpageimages/lnr%20image%20placeholder%201.png",
    alt: "LNR Cycle Center promotional banner",
  },
  {
    src: "/Customerpageimages/lnr%20placeholder%201.png",
    alt: "LNR Cycle Center promotional banner",
  },
];

export const MAP_SRC = "/Customerpageimages/map.png";

export type GalleryImage = {
  src: string;
  alt: string;
};

/** Five images: left (2), center (2), right tall (1) — see GallerySection. */
export const GALLERY_IMAGES: GalleryImage[] = [
  {
    src: "/Customerpageimages/Screenshot%202025-10-24%20180235%201.png",
    alt: "Customer gallery photo",
  },
  {
    src: "/Customerpageimages/Screenshot%202025-10-24%20180651%201.png",
    alt: "Customer gallery photo",
  },
  {
    src: "/Customerpageimages/Screenshot%202025-10-24%20181456%201.png",
    alt: "Customer gallery photo",
  },
  {
    src: "/Customerpageimages/Screenshot%202025-10-24%20181650%201.png",
    alt: "Customer gallery photo",
  },
  {
    src: "/Customerpageimages/Screenshot%202025-10-24%20181748%201.png",
    alt: "Customer gallery photo",
  },
];

export const STORE_INFO = {
  name: "LNR Cycle Center",
  addressLine1: "Karangahan Boulevard, Bonbon,",
  addressLine2: "Tabaco City, Albay, Philippines",
  hours: "10:00AM to 5:00PM",
  email: "lnrcyclecenter@gmail.com",
  directionsUrl:
    "https://www.google.com/maps/search/?api=1&query=Karangahan%20Boulevard%2C%20Bonbon%2C%20Tabaco%20City%2C%20Albay%2C%20Philippines",
};

/** Philippine Peso formatting, e.g. ₱ 3,500.00 */
export function formatPeso(value: number): string {
  return `₱ ${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
