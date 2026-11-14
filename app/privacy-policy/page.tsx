import type { Metadata } from "next";
import PolicyPage from "@/components/customer/PolicyPage";
export const metadata: Metadata = { title: "Privacy Policy | LNR Cycle Center" };
const sections = [
  {
    "title": "Information we collect",
    "text": "When you create an account, we collect your name, email address, password through our authentication service, optional phone number, and saved delivery address and coordinates. When you use our services, we process orders, selected bicycle components, payment references and uploaded payment proofs, event registrations, and relevant account and transaction records. Hosting and service providers may also process technical information such as IP addresses and request logs."
  },
  {
    "title": "Return and refund evidence",
    "text": "When you request a return or refund, we process the ordered item, your reason, uploaded photos or videos, review history, and any pickup address and contact information you provide. Evidence is kept in private storage and made available to your account and authorized shop administrators for assessment and follow-up. Provide only files relevant to the issue and avoid including unrelated personal or financial information."
  },
  {
    "title": "How we use information",
    "text": "We use information to create and secure accounts, deliver orders, verify payments, manage stock and event registrations, respond to requests, and maintain the website. Account and order processing supports the services you request; security and record keeping also support legitimate business needs and applicable obligations. Browser location access is requested through your device permission controls; you may use the location picker manually instead. The sign-up agreement is not permission for unrelated marketing."
  },
  {
    "title": "AI bicycle recommendations",
    "text": "If you request an AI recommendation, the text you enter, your stated budget, and relevant product catalogue information are sent to Groq to generate suggestions. Avoid entering names, contact details, payment information, or other sensitive information in the prompt. AI suggestions are advisory; shop review is needed for fit and compatibility. Groq processes the request under its applicable service terms and privacy practices."
  },
  {
    "title": "Service providers and sharing",
    "text": "Our website uses Supabase for authentication, database and file storage, Vercel when hosted there, and Groq for AI recommendations. Authorized shop personnel and providers supporting these services may process information needed for their tasks. Delivery information may be shared with those fulfilling your order. Providers may process information outside the Philippines. Information may also be disclosed where required by law or necessary to address fraud and security incidents."
  },
  {
    "title": "Cookies and location",
    "text": "Authentication cookies keep you signed in and distinguish customer and administrator sessions. Browser storage may retain cart or interface preferences. Blocking necessary cookies can prevent account features from working. Device location is accessed only after browser permission and is used to help set your delivery location; this feature is not continuous location tracking."
  },
  {
    "title": "Retention and security",
    "text": "Account and saved-location information is retained while needed to provide your account and requested services. Order, payment and event records may be retained after account closure where needed for unresolved transactions, accounting, legal obligations or disputes, and then deleted or anonymized when no longer needed. Backups and provider logs follow their applicable retention cycles. Access controls and authentication help protect records, but no internet service can guarantee complete security."
  },
  {
    "title": "Your choices and privacy rights",
    "text": "You may request access to or correction of your information, account closure, or deletion where applicable. You may also object to processing or withdraw consent where processing relies on consent, subject to lawful limitations and necessary transaction records. Contact the shop to make a request; we may verify your identity. You may raise unresolved privacy concerns with the Philippine National Privacy Commission. These rights remain subject to the Data Privacy Act of 2012 and applicable rules."
  },
  {
    "title": "Updates to this policy",
    "text": "We may update this notice when website features or processing practices change. The date above identifies this version. Material changes affecting how personal information is processed should be communicated through the website or appropriate account communication."
  }
];
export default function Page() { return <PolicyPage title="Privacy Policy" introduction="This notice explains how LNR Cycle Center handles information when you browse products, create an account, place orders, build a bicycle or register for events." sections={sections} />; }
