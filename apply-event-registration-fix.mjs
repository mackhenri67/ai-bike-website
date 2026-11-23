import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd(), staged=new Map();
function get(rel){const p=path.join(root,rel);if(!fs.existsSync(p))throw Error(`Missing ${rel}. Run from the repository root.`);return fs.readFileSync(p,'utf8');}
function once(src,oldText,newText,label){
  // Safe to re-run: if this exact replacement is already present, leave it alone.
  if (src.includes(newText)) return src;
  const i=src.indexOf(oldText);
  if(i<0||src.indexOf(oldText,i+oldText.length)>=0)throw Error(`Expected one match for ${label}. No files were changed; check the README troubleshooting steps and your source version.`);
  return src.slice(0,i)+newText+src.slice(i+oldText.length);
}
function edit(rel,pairs){let s=staged.get(rel) ?? get(rel);for(const [a,b,label] of pairs)s=once(s,a,b,`${rel}: ${label}`);staged.set(rel,s);}

edit('lib/data/types.ts',[
['export type EventStatus = "draft" | "published" | "cancelled";\n','export type EventStatus = "draft" | "published" | "cancelled";\n\n/** Customer-selectable registration option and its event-specific fee. */\nexport type EventRegistrationCategory = { name: string; price: number };\n','registration category type'],
['  price: number;\n  capacity: number;\n  slots_booked: number;\n  organizer: string | null;\n','  price: number;\n  /** Optional custom entry categories; absent/empty means use the legacy flat event price. */\n  registration_categories?: EventRegistrationCategory[] | null;\n  capacity: number;\n  slots_booked: number;\n  organizer: string | null;\n','event row categories'],
['  price: number;\n  capacity: number;\n  banner_image_url: string | null;\n  status: EventStatus;\n};\n','  price: number;\n  registration_categories: EventRegistrationCategory[];\n  capacity: number;\n  banner_image_url: string | null;\n  status: EventStatus;\n};\n','event input categories']
]);

edit('components/admin/events/EventsManager.tsx',[
['import type { EventInput, EventRow, EventStatus } from "@/lib/data/types";','import type { EventInput, EventRegistrationCategory, EventRow, EventStatus } from "@/lib/data/types";','type import'],
['  bannerImageUrl: string;\n  status: EventStatus;\n};\n','  bannerImageUrl: string;\n  status: EventStatus;\n  registrationCategories: { name: string; price: string }[];\n};\n','form type'],
['  bannerImageUrl: "",\n  status: "draft",\n};\n','  bannerImageUrl: "",\n  status: "draft",\n  registrationCategories: [],\n};\n','empty form'],
['      bannerImageUrl: event.banner_image_url ?? "",\n      status: event.status,\n','      bannerImageUrl: event.banner_image_url ?? "",\n      status: event.status,\n      registrationCategories: (event.registration_categories ?? []).map((item) => ({ name: item.name, price: String(item.price) })),\n','edit existing event'],
['      banner_image_url: form.bannerImageUrl || null,\n      status: form.status,\n','      banner_image_url: form.bannerImageUrl || null,\n      status: form.status,\n      registration_categories: form.registrationCategories.map((item) => ({ name: item.name.trim(), price: Number(item.price) })) as EventRegistrationCategory[],\n','save payload'],
['                    {event.price > 0 ? formatPeso(event.price) : "Free"}\n','                    {event.registration_categories?.length ? `${event.registration_categories.length} categories` : event.price > 0 ? formatPeso(event.price) : "Free"}\n','event table fee'],
['              <div className={styles.formRow}>\n                <label className={styles.label}>\n                  <span>Price (₱)</span>\n                  <input\n                    type="number"\n                    min={0}\n                    step="0.01"\n                    className={styles.input}\n                    value={form.price}\n                    onChange={(e) => updateField("price", e.target.value)}\n                  />\n                </label>\n                <label className={styles.label}>\n                  <span>Capacity</span>\n                  <input\n                    type="number"\n                    min={0}\n                    className={styles.input}\n                    value={form.capacity}\n                    onChange={(e) => updateField("capacity", e.target.value)}\n                  />\n                </label>\n              </div>\n',
'              <div className={styles.formRow}>\n                <label className={styles.label}>\n                  <span>Base fee (₱) · used when no categories are added</span>\n                  <input type="number" min={0} step="0.01" className={styles.input} value={form.price} onChange={(e) => updateField("price", e.target.value)} />\n                </label>\n                <label className={styles.label}>\n                  <span>Capacity</span>\n                  <input type="number" min={0} className={styles.input} value={form.capacity} onChange={(e) => updateField("capacity", e.target.value)} />\n                </label>\n              </div>\n\n              <section className={styles.priceCategorySection} aria-label="Registration categories and prices">\n                <div><h3 className={styles.priceCategoryTitle}>Registration categories and fees</h3><p className={styles.priceCategoryHint}>Add the ride distances or entry types customers can choose. Example: 50 km — ₱250 and 60 km — ₱250. When categories are added, their prices replace the base fee during registration.</p></div>\n                {form.registrationCategories.map((item, index) => (\n                  <div className={styles.priceCategoryRow} key={`registration-category-${index}`}>\n                    <label className={styles.label}><span>Category name</span><input className={styles.input} value={item.name} maxLength={60} placeholder="e.g. 50 km" onChange={(event) => setForm((current) => ({ ...current, registrationCategories: current.registrationCategories.map((category, categoryIndex) => categoryIndex === index ? { ...category, name: event.target.value } : category) }))} required /></label>\n                    <label className={styles.label}><span>Price (PHP)</span><input className={styles.input} type="number" min="0" max="99999999.99" step="0.01" value={item.price} onChange={(event) => setForm((current) => ({ ...current, registrationCategories: current.registrationCategories.map((category, categoryIndex) => categoryIndex === index ? { ...category, price: event.target.value } : category) }))} required /></label>\n                    <button type="button" className={styles.categoryRemove} onClick={() => setForm((current) => ({ ...current, registrationCategories: current.registrationCategories.filter((_, categoryIndex) => categoryIndex !== index) }))}>Remove</button>\n                  </div>\n                ))}\n                <button type="button" className={styles.categoryAdd} onClick={() => setForm((current) => ({ ...current, registrationCategories: [...current.registrationCategories, { name: "", price: "250" }] }))} disabled={form.registrationCategories.length >= 30}>+ Add registration category</button>\n              </section>\n',
'category editor UI']
]);

edit('components/admin/events/EventsManager.module.css',[
['/* Unified LNR admin design */','/* Event registration-category editor */\n.priceCategorySection{display:flex;flex-direction:column;gap:12px;padding:16px;border:1px solid #e5e8e3;border-radius:12px;background:#fafbf8;}\n.priceCategoryTitle{margin:0 0 5px;color:#273025;font-size:14px;font-weight:700;}\n.priceCategoryHint{margin:0;color:#6d7768;font-size:12px;line-height:1.55;}\n.priceCategoryRow{display:grid;grid-template-columns:minmax(0,1fr) minmax(130px,.55fr) auto;gap:10px;align-items:end;padding:12px;background:#fff;border:1px solid #e5e8e3;border-radius:9px;}\n.categoryAdd{align-self:flex-start;min-height:36px;padding:0 13px;border:1px solid #d5dccf;border-radius:8px;background:#f2f5ed;color:#3d4b35;font-size:12px;font-weight:650;cursor:pointer;}\n.categoryAdd:disabled{opacity:.5;cursor:not-allowed;}\n.categoryRemove{min-height:40px;padding:0 11px;border:1px solid #f1c9c9;border-radius:8px;background:#fff7f7;color:#a33a3a;font-size:12px;font-weight:600;cursor:pointer;}\n@media(max-width:560px){.priceCategoryRow{grid-template-columns:1fr;}}\n\n/* Unified LNR admin design */','category editor styles']
]);

edit('app/admin/(shell)/events/actions.ts',[
['  if (input.capacity < 0) {\n    return { error: "Capacity cannot be negative." };\n  }\n\n  const result = await upsertEvent({',
'  if (input.capacity < 0) {\n    return { error: "Capacity cannot be negative." };\n  }\n\n  const registrationCategories = input.registration_categories ?? [];\n  if (!Array.isArray(registrationCategories) || registrationCategories.length > 30) {\n    return { error: "An event can have up to 30 registration categories." };\n  }\n  const categoryNames = new Set<string>();\n  for (const item of registrationCategories) {\n    const name = typeof item?.name === "string" ? item.name.trim() : "";\n    const price = Number(item?.price);\n    const normalized = name.toLocaleLowerCase();\n    if (!name || name.length > 60) return { error: "Each registration category needs a name of 1 to 60 characters." };\n    if (categoryNames.has(normalized)) return { error: `The registration category \\"${name}\\" is duplicated.` };\n    if (!Number.isFinite(price) || price < 0 || price > 99999999.99 || Math.abs(price * 100 - Math.round(price * 100)) > 0.000001) {\n      return { error: `Enter a valid PHP price for \\"${name}\\" (up to two decimal places).` };\n    }\n    categoryNames.add(normalized);\n  }\n\n  const result = await upsertEvent({',
'validate registration categories'],
['    organizer: input.organizer,\n    status: input.status,\n','    organizer: input.organizer,\n    registrationCategories,\n    status: input.status,\n','pass category config']
]);

edit('lib/data/admin/events.ts',[
['  location, banner_image_url, price, capacity, slots_booked, organizer,\n  status, created_at, updated_at\n','  location, banner_image_url, price, registration_categories, capacity, slots_booked, organizer,\n  status, created_at, updated_at\n','admin event select'],
['  price: number;\n  capacity: number;\n  organizer: string | null;\n','  price: number;\n  registrationCategories: { name: string; price: number }[];\n  capacity: number;\n  organizer: string | null;\n','upsert input'],
['    price: input.price,\n    capacity: input.capacity,\n    organizer: input.organizer,\n','    price: input.price,\n    registration_categories: input.registrationCategories,\n    capacity: input.capacity,\n    organizer: input.organizer,\n','upsert payload']
]);

edit('lib/data/customer/events.ts',[
['  location, banner_image_url, price, capacity, slots_booked, organizer,\n  status, created_at, updated_at\n','  location, banner_image_url, price, registration_categories, capacity, slots_booked, organizer,\n  status, created_at, updated_at\n','public event select']
]);

edit('app/events/page.tsx',[
['                            {event.price > 0\n                              ? formatCurrency(event.price)\n                              : "Free"}\n','                            {event.registration_categories?.length\n                              ? `From ${formatCurrency(Math.min(...event.registration_categories.map((item) => Number(item.price) || 0)))}`\n                              : event.price > 0 ? formatCurrency(event.price) : "Free"}\n','event listing starting fee']
]);

edit('app/events/[slug]/page.tsx',[
['                <div>\n                  <dt>Fee</dt>\n                  <dd>{event.price > 0 ? formatCurrency(event.price) : "Free"}</dd>\n                </div>\n','                <div>\n                  <dt>Registration fee</dt>\n                  <dd>{event.registration_categories?.length ? "Choose a category below" : event.price > 0 ? formatCurrency(event.price) : "Free"}</dd>\n                </div>\n','event fee fact'],
['              {event.description ? (\n                <p className={styles.description}>{event.description}</p>\n              ) : null}\n','              {event.registration_categories?.length ? (\n                <section className={styles.registrationCategories} aria-labelledby="registration-categories-title">\n                  <h2 id="registration-categories-title" className={styles.registrationCategoriesTitle}>Available registration categories</h2>\n                  <ul className={styles.registrationCategoryList}>\n                    {event.registration_categories.map((item) => (\n                      <li key={item.name} className={styles.registrationCategoryItem}><span>{item.name}</span><strong>{formatCurrency(Number(item.price) || 0)}</strong></li>\n                    ))}\n                  </ul>\n                </section>\n              ) : null}\n\n              {event.description ? (\n                <p className={styles.description}>{event.description}</p>\n              ) : null}\n','detail category list']
]);

edit('app/events/[slug]/detail.module.css',[
['.soldOut {\n','.registrationCategories{margin-top:22px;padding:18px;border:1px solid #e5e7eb;border-radius:12px;background:#fafafa;}\n.registrationCategoriesTitle{margin:0 0 12px;color:#111827;font-size:16px;font-weight:750;}\n.registrationCategoryList{list-style:none;padding:0;margin:0;display:grid;gap:8px;}\n.registrationCategoryItem{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 14px;border:1px solid #e5e7eb;border-radius:9px;background:#fff;color:#374151;font-size:14px;}\n.registrationCategoryItem strong{color:#111827;white-space:nowrap;}\n\n.soldOut {\n','detail category styles']
]);

staged.set('app/events/[slug]/register/register-view.tsx', `"use client";
import { useState } from "react";
import { useActionState } from "react";
import { registerForEventAction } from "./action";
import type { EventRow } from "@/lib/data/types";
import styles from "./register.module.css";
const money = (value: number) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(value);

export default function RegisterView({ event, email, fullName }: { event: EventRow; email?: string; fullName?: string }) {
  const [state, formAction, pending] = useActionState(registerForEventAction, { error: null });
  const categories = event.registration_categories ?? [];
  const [selectedCategory, setSelectedCategory] = useState("");
  const selectedOption = categories.find((item) => item.name === selectedCategory);
  const fee = categories.length ? Number(selectedOption?.price ?? 0) : Number(event.price) || 0;

  return <form action={formAction} className={styles.form} noValidate>
    <input type="hidden" name="slug" value={event.slug} />
    {!categories.length ? <input type="hidden" name="category" value={event.category} /> : null}
    <div className={styles.layout}>
      <section className={styles.card}>
        <h2 className={styles.heading}>Rider details</h2>
        {categories.length ? <label className={styles.field}>
          <span className={styles.label}>Registration category *</span>
          <select name="category" className={styles.input} value={selectedCategory} onChange={(event) => setSelectedCategory(event.target.value)} required>
            <option value="">Select the category you want to join</option>
            {categories.map((item) => <option key={item.name} value={item.name}>{item.name} — {money(Number(item.price) || 0)}</option>)}
          </select>
          <small className={styles.note}>Choose the distance or entry category you want to join. The registration fee updates based on your selection.</small>
        </label> : null}
        <label className={styles.field}><span className={styles.label}>Full name *</span><input name="rider_name" className={styles.input} placeholder="Juan Dela Cruz" defaultValue={fullName} autoComplete="name" maxLength={150} required /></label>
        <label className={styles.field}><span className={styles.label}>Account email</span><input className={styles.input} value={email ?? ""} readOnly aria-describedby="account-email-note" /><small id="account-email-note" className={styles.note}>This registration uses your signed-in account contact details.</small></label>
        <h3 className={styles.heading}>Emergency contact</h3>
        <label className={styles.field}><span className={styles.label}>Emergency contact name *</span><input name="emergency_contact_name" className={styles.input} placeholder="Contact person's full name" autoComplete="off" maxLength={120} required /></label>
        <label className={styles.field}><span className={styles.label}>Emergency contact number *</span><input name="emergency_contact_phone" type="tel" inputMode="tel" className={styles.input} placeholder="e.g. 0917 123 4567" autoComplete="tel" maxLength={30} required /><small className={styles.note}>Enter a phone number where the contact person can be reached.</small></label>
      </section>
      <aside className={styles.summary} aria-label="Order summary">
        <h2 className={styles.summaryLabel}>Order summary</h2><h3>{event.title}</h3>
        <p>{new Date(event.event_date).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", dateStyle: "full" })}</p>
        <dl>
          {categories.length ? <div><dt>Category</dt><dd>{selectedOption?.name ?? "Not selected"}</dd></div> : null}
          <div><dt>Registration fee</dt><dd>{money(fee)}</dd></div>
          <div className={styles.total}><dt>Total</dt><dd>{money(fee)}</dd></div>
        </dl>
      </aside>
    </div>
    {state.error ? <p className={styles.error} role="alert">{state.error}</p> : null}
    <div className={styles.actions}><button type="submit" className={styles.submit} disabled={pending || (categories.length > 0 && !selectedOption)}>{pending ? "Reserving…" : "Continue to Online Payment"}</button></div>
  </form>;
}
`);

staged.set('components/customer/EventTicketCard.tsx', `import Link from "next/link";
import type { EventRegistrationRow } from "@/lib/data/types";
import styles from "./EventTicketCard.module.css";
const money=(v:number)=>new Intl.NumberFormat("en-PH",{style:"currency",currency:"PHP"}).format(v);
const date=(v:string)=>new Date(v).toLocaleString("en-PH",{timeZone:"Asia/Manila",dateStyle:"long",timeStyle:"short"});
export default function EventTicketCard({ registration: reg }: { registration: EventRegistrationRow }) {
  const paid=reg.payment_status==='paid';const cancelled=reg.status==='cancelled';
  const status=cancelled?'Cancelled':paid?'Confirmed':reg.payment_status==='rejected'?'Payment rejected':reg.proof_screenshot_url?'Awaiting review':'Awaiting payment';
  return <section className={styles.ticket} aria-label="Event entry pass">
    <div className={styles.stub}><span className={styles.stubLabel}>ENTRY PASS</span><strong className={styles.stubCode}>{reg.registration_code}</strong></div>
    <div className={styles.main}><div className={styles.eventHeader}><h2 className={styles.eventTitle}>{reg.event?.title??'Event'}</h2><span className={styles.badge + (paid&&!cancelled ? " " + styles.paid : " " + styles.unpaid)}>{status}</span></div>
      <dl className={styles.facts}><div><dt>Rider</dt><dd>{reg.rider_name}</dd></div>{reg.category?<div><dt>Registration category</dt><dd>{reg.category}</dd></div>:null}<div><dt>Registration code</dt><dd>{reg.registration_code}</dd></div><div><dt>Date &amp; roll out</dt><dd>{reg.event?date(reg.event.event_date):'To be announced'}</dd></div><div><dt>Start / finish</dt><dd>{reg.event?.location??'To be announced'}</dd></div><div><dt>Emergency contact</dt><dd>{reg.emergency_contact || "Not provided"}</dd></div><div><dt>Account contact</dt><dd>{reg.customer_email||'Not provided'}{reg.customer_phone?<><br/>{reg.customer_phone}</>:null}</dd></div><div><dt>Registration date</dt><dd>{date(reg.created_at)}</dd></div><div><dt>Registration fee</dt><dd>{money(Number(reg.amount_paid)||0)}</dd></div><div><dt>GCash reference</dt><dd>{reg.reference_number||'Not supplied'}</dd></div><div><dt>Payment status</dt><dd>{reg.payment_status}</dd></div></dl>
      {cancelled?<p className={styles.ctaText}>This registration has been cancelled.</p>:paid?<p className={styles.confirmed}>✓ Present this registration code at the event booth.</p>:<div className={styles.cta}><p className={styles.ctaText}>{reg.proof_screenshot_url&&reg.payment_status!=='rejected'?'Your payment proof is awaiting verification.':'Complete your payment to confirm your slot.'}</p><Link href={'/event-payment/' + encodeURIComponent(reg.registration_code)} className={styles.payButton}>View payment</Link></div>}
      {reg.proof_screenshot_url?<details className={styles.proof}><summary>View payment proof</summary><img src={reg.proof_screenshot_url} alt="Your submitted payment proof" className={styles.proofImg}/></details>:null}
    </div>
  </section>;
}
`);

edit('components/admin/events/RegistrationsManager.tsx',[
['                <th>Rider</th>\n                <th>Amount</th>\n','                <th>Rider</th>\n                <th>Category</th>\n                <th>Amount</th>\n','signup table category heading'],
['                  <td>{reg.rider_name}{reg.emergency_contact ? <p className={styles.emergencyContact}>Emergency: {reg.emergency_contact}</p> : null}</td>\n                  <td>{formatPeso(Number(reg.amount_paid) || 0)}</td>\n','                  <td>{reg.rider_name}{reg.emergency_contact ? <p className={styles.emergencyContact}>Emergency: {reg.emergency_contact}</p> : null}</td>\n                  <td>{reg.category || "—"}</td>\n                  <td>{formatPeso(Number(reg.amount_paid) || 0)}</td>\n','signup table category value'],
['              <div>\n                <dt>Rider</dt>\n                <dd>{reviewing.rider_name}</dd>\n              </div>\n','              <div>\n                <dt>Rider</dt>\n                <dd>{reviewing.rider_name}</dd>\n              </div>\n              <div><dt>Registration category</dt><dd>{reviewing.category || "—"}</dd></div>\n','signup review category']
]);

// Separate emergency contact name and phone number in registration.
edit('lib/data/types.ts',[
['  emergency_contact?: string | null;\n','  emergency_contact?: string | null;\n  emergency_contact_name?: string | null;\n  emergency_contact_phone?: string | null;\n','split emergency contact row fields']
]);

edit('lib/data/admin/events.ts',[
['  customer_phone, rider_name, plate_number, emergency_contact, category, amount_paid,\n','  customer_phone, rider_name, plate_number, emergency_contact, emergency_contact_name, emergency_contact_phone, category, amount_paid,\n','admin registration select split fields']
]);

edit('lib/data/customer/events.ts',[
['  customer_phone, rider_name, plate_number, emergency_contact, category, amount_paid,\n','  customer_phone, rider_name, plate_number, emergency_contact, emergency_contact_name, emergency_contact_phone, category, amount_paid,\n','customer registration select split fields'],
['  emergencyContact?: string | null;\n  category?: string | null;\n','  emergencyContactName: string;\n  emergencyContactPhone: string;\n  category?: string | null;\n','registration input split emergency contact'],
['    p_emergency: input.emergencyContact ?? null,\n','    p_emergency_name: input.emergencyContactName,\n    p_emergency_phone: input.emergencyContactPhone,\n','registration RPC split emergency contact']
]);

edit('app/events/[slug]/register/action.ts',[
['  const emergencyContact = String(formData.get("emergency_contact") ?? "").trim();\n','  const emergencyContactName = String(formData.get("emergency_contact_name") ?? "").trim();\n  const emergencyContactPhone = String(formData.get("emergency_contact_phone") ?? "").trim();\n','read split emergency contact fields'],
['  const phoneDigits = emergencyContact.replace(/\\D/g, "");\n  if (emergencyContact.length > 250 || !/\\p{L}/u.test(emergencyContact) || phoneDigits.length < 7 || phoneDigits.length > 15) {\n    return { error: "Please enter an emergency contact name and phone number." };\n  }\n','  const phoneDigits = emergencyContactPhone.replace(/\\D/g, "");\n  if (!emergencyContactName || emergencyContactName.length > 120 || !/\\p{L}/u.test(emergencyContactName)) {\n    return { error: "Please enter the emergency contact person’s name." };\n  }\n  if (emergencyContactPhone.length > 30 || phoneDigits.length < 7 || phoneDigits.length > 15) {\n    return { error: "Please enter a valid emergency contact phone number." };\n  }\n','validate split emergency contact fields'],
['    emergencyContact,\n','    emergencyContactName,\n    emergencyContactPhone,\n','pass split emergency contact fields']
]);

edit('components/admin/events/RegistrationsManager.tsx',[
['                  <td>{reg.rider_name}{reg.emergency_contact ? <p className={styles.emergencyContact}>Emergency: {reg.emergency_contact}</p> : null}</td>\n','                  <td>{reg.rider_name}{reg.emergency_contact_name ? <p className={styles.emergencyContact}>Emergency contact: {reg.emergency_contact_name}</p> : null}{reg.emergency_contact_phone ? <p className={styles.emergencyContact}>Emergency number: {reg.emergency_contact_phone}</p> : null}{!reg.emergency_contact_name && !reg.emergency_contact_phone && reg.emergency_contact ? <p className={styles.emergencyContact}>Emergency: {reg.emergency_contact}</p> : null}</td>\n','signup list split emergency contact'],
['              {reviewing.emergency_contact ? <div><dt>Emergency contact</dt><dd>{reviewing.emergency_contact}</dd></div> : null}\n','              {reviewing.emergency_contact_name ? <div><dt>Emergency contact name</dt><dd>{reviewing.emergency_contact_name}</dd></div> : null}\n              {reviewing.emergency_contact_phone ? <div><dt>Emergency contact number</dt><dd>{reviewing.emergency_contact_phone}</dd></div> : null}\n              {!reviewing.emergency_contact_name && !reviewing.emergency_contact_phone && reviewing.emergency_contact ? <div><dt>Emergency contact (legacy record)</dt><dd>{reviewing.emergency_contact}</dd></div> : null}\n','signup review split emergency contact']
]);

edit('components/customer/EventTicketCard.tsx',[
['<div><dt>Emergency contact</dt><dd>{reg.emergency_contact || "Not provided"}</dd></div>','{reg.emergency_contact_name ? <div><dt>Emergency contact name</dt><dd>{reg.emergency_contact_name}</dd></div> : null}{reg.emergency_contact_phone ? <div><dt>Emergency contact number</dt><dd>{reg.emergency_contact_phone}</dd></div> : null}{!reg.emergency_contact_name && !reg.emergency_contact_phone ? <div><dt>Emergency contact</dt><dd>{reg.emergency_contact || "Not provided"}</dd></div> : null}','ticket split emergency contact fields']
]);

// All replacements were checked above. Now create backups and write the staged files.
for (const [relative, content] of staged) {
  const full = path.join(root, relative);
  const current = fs.readFileSync(full, 'utf8');
  if (current !== content) {
    const backup = `${full}.event-categories.bak`;
    if (!fs.existsSync(backup)) fs.copyFileSync(full, backup);
    fs.writeFileSync(full, content, 'utf8');
  }
}
const adminEvents = staged.get('components/admin/events/EventsManager.tsx') ?? get('components/admin/events/EventsManager.tsx');
if (!adminEvents.includes('priceCategorySection') || !adminEvents.includes('Add registration category')) {
  throw Error('The Add/Edit Event form does not contain the registration-category editor. No staged files were written. Please send the current components/admin/events/EventsManager.tsx so the installer can be adapted.');
}
console.log(`Updated ${staged.size} repository files for event-specific registration categories and separate emergency contacts:`);
for (const relative of staged.keys()) console.log(` - ${relative}`);
console.log('Original files were backed up with the suffix .event-categories.bak.');
