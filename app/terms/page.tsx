import type { Metadata } from "next";
import PolicyPage from "@/components/customer/PolicyPage";
export const metadata: Metadata = { title: "Terms and Conditions | LNR Cycle Center" };
const sections = [
  {
    "title": "Accounts and agreement",
    "text": "By creating an account, you agree to these Terms and Conditions and acknowledge that you have read the Privacy Policy. Provide accurate information, keep your login credentials private, and contact the shop if you suspect unauthorized use. Use the service only where you can validly enter the relevant transaction; minors should involve a parent or guardian. You remain responsible for the information and requests submitted through your account."
  },
  {
    "title": "Products, prices and availability",
    "text": "Prices are displayed in Philippine pesos unless stated otherwise. Product images and descriptions guide selection; confirm important specifications with the shop. Availability may change. An order submission is a request and remains subject to stock and payment verification and shop confirmation. If an error affects your order, the shop should explain the issue and confirm any revised price or offer cancellation and an applicable refund rather than charge a different amount without your agreement."
  },
  {
    "title": "Bike builds and AI suggestions",
    "text": "Manual builds and AI recommendations help you select catalogue items. Generated recommendations may contain mistakes and do not confirm mechanical compatibility, safe assembly, sizing, or suitability for a particular rider. Confirm the final components, price, fit and assembly arrangements with qualified shop staff before proceeding. This does not remove any rights you have concerning the goods or services supplied."
  },
  {
    "title": "Payments and payment proofs",
    "text": "Follow the payment details shown for your transaction and submit only genuine payment references and proofs. Uploaded proof does not by itself confirm payment; the shop verifies receipt. Do not upload another person’s financial information without authority. Never share passwords, PINs or one-time passwords through the site or with shop personnel."
  },
  {
    "title": "Delivery, cancellations, returns and refunds",
    "text": "Provide a complete delivery location and reachable contact details. Delivery fees and arrangements should be confirmed before fulfillment. To cancel or report missing, defective or incorrect items, contact the shop promptly with your order number. Cancellation availability depends on fulfillment status. For eligible delivered items, customers must submit a return/refund request through My Orders within three days (72 hours) from the system's recorded delivery/completion time. The request must include the reason and photo or video evidence for the shop's review. The item must be returned in the same condition in which it was received, including the parts, accessories, tags and packaging supplied with it, and must not have additional damage, alterations or signs of use after receipt, except for reasonable inspection needed to identify the reported issue. After the request is approved, the customer may select rider pickup or drop-off at the physical store and coordinate the arrangement with LNR Cycle Center. Selecting a method does not automatically book a rider or issue a refund; the returned item is subject to inspection and refund processing is handled separately. Requests submitted after the three-day online window may be referred to the shop for assistance, without limiting rights available under applicable Philippine consumer law or any applicable warranty. Nothing in these terms removes statutory remedies for defective, incorrect or otherwise non-conforming goods."
  },
  {
    "title": "Events",
    "text": "Event registration is subject to available slots, the displayed requirements, payment verification where required, and organizer confirmation. Read each event’s schedule, participation rules and safety requirements before registering. Contact the shop about cancellations, changes or refund arrangements for the specific event. Registration does not replace any separately required event consent or safety briefing."
  },
  {
    "title": "Acceptable use",
    "text": "Do not submit fraudulent orders or payment proofs, misuse another person’s account or information, upload harmful content, interfere with the service, bypass security controls, or copy content unlawfully. The shop may restrict access to address misuse or protect the service, subject to applicable law and any outstanding transaction obligations."
  },
  {
    "title": "Service availability and responsibility",
    "text": "The website may be interrupted for maintenance, connectivity issues or provider outages. Contact the shop if a transaction appears incomplete before repeating a payment. Each party remains responsible to the extent required by applicable law. Nothing in these terms excludes mandatory consumer rights or liability that cannot lawfully be excluded."
  },
  {
    "title": "Changes and disputes",
    "text": "These terms apply under the laws of the Philippines. Contact the shop first so it can review a concern; you retain the right to seek assistance from appropriate authorities or available legal remedies. Updated terms will be posted with a revised date. Material changes requiring renewed agreement should be presented before they apply to a new transaction."
  }
];
export default function Page() { return <PolicyPage title="Terms and Conditions" introduction="These terms describe the use of the LNR Cycle Center website and its shopping, bicycle customization and event registration services." sections={sections} />; }
