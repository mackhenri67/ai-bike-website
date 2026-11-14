"use client";
import RecordPreviewButton from "@/components/admin/RecordPreviewButton";

import { useMemo, useRef, useState, type ChangeEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getAdminBrowserClient } from "@/lib/supabase/client";
import {
  deleteEventAction,
  saveEventAction,
} from "@/app/admin/(shell)/events/actions";
import type { EventInput, EventRow, EventStatus } from "@/lib/data/types";
import styles from "./EventsManager.module.css";
import { CloseIcon, ImageIcon, PencilIcon, PlusIcon, TrashIcon } from "./icons";

type EventForm = {
  title: string;
  slug: string;
  category: string;
  description: string;
  location: string;
  organizer: string;
  eventDate: string;
  price: string;
  capacity: string;
  bannerImageUrl: string;
  status: EventStatus;
};

type ModalState = { mode: "add" } | { mode: "edit"; event: EventRow } | null;

type EventsManagerProps = {
  embedded?: boolean;
  initialEvents: EventRow[];
  error?: string | null;
};

const EMPTY_FORM: EventForm = {
  title: "",
  slug: "",
  category: "Fun Ride",
  description: "",
  location: "",
  organizer: "",
  eventDate: "",
  price: "0",
  capacity: "0",
  bannerImageUrl: "",
  status: "draft",
};

const STATUS_BADGE_CLASS: Record<EventStatus, string> = {
  draft: "badgeDraft",
  published: "badgePublished",
  cancelled: "badgeCancelled",
};

const CATEGORIES = ["Fun Ride", "Race", "Charity Ride", "Workshop", "Meetup"];

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function formatPeso(value: number): string {
  return `₱${value.toLocaleString("en-US")}`;
}

function formatEventDate(value: string): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function EventsManager({
  initialEvents,
  embedded = false,
  error: initialError,
}: EventsManagerProps) {
  const [deletedEventIds, setDeletedEventIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [modal, setModal] = useState<ModalState>(null);
  const [pendingDelete, setPendingDelete] = useState<EventRow | null>(null);
  const [form, setForm] = useState<EventForm>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const slugEdited = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const error = actionError ?? initialError ?? null;

  const sorted = useMemo(
    () =>
      initialEvents
        .filter((event) => !deletedEventIds.has(event.id))
        .sort((a, b) => a.event_date.localeCompare(b.event_date)),
    [initialEvents, deletedEventIds],
  );

  const updateField = <K extends keyof EventForm>(
    key: K,
    value: EventForm[K],
  ) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleTitleChange = (value: string) => {
    setForm((prev) => ({
      ...prev,
      title: value,
      slug: slugEdited.current ? prev.slug : slugify(value),
    }));
  };

  const openAdd = () => {
    slugEdited.current = false;
    setForm(EMPTY_FORM);
    setFormError(null);
    setModal({ mode: "add" });
  };

  const openEdit = (event: EventRow) => {
    slugEdited.current = true;
    setForm({
      title: event.title,
      slug: event.slug,
      category: event.category,
      description: event.description ?? "",
      location: event.location,
      organizer: event.organizer ?? "",
      eventDate: event.event_date,
      price: String(event.price ?? 0),
      capacity: String(event.capacity ?? 0),
      bannerImageUrl: event.banner_image_url ?? "",
      status: event.status,
    });
    setFormError(null);
    setModal({ mode: "edit", event });
  };

  const closeModal = () => {
    if (saving) return;
    setModal(null);
    setFormError(null);
  };

  const handleUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setFormError(null);
    try {
      const supabase = getAdminBrowserClient();
      const path = `events/${Date.now()}-${file.name.replace(/\s+/g, "-")}`;
      const { error: uploadError } = await supabase.storage
        .from("images")
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;
      const {
        data: { publicUrl },
      } = supabase.storage.from("images").getPublicUrl(path);
      updateField("bannerImageUrl", publicUrl);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    const payload: EventInput = {
      title: form.title.trim(),
      slug: form.slug.trim() || slugify(form.title),
      category: form.category,
      description: form.description.trim() || null,
      location: form.location.trim(),
      organizer: form.organizer.trim() || null,
      event_date: form.eventDate,
      price: Number(form.price) || 0,
      capacity: Number(form.capacity) || 0,
      banner_image_url: form.bannerImageUrl || null,
      status: form.status,
    };
    if (modal?.mode === "edit") payload.id = modal.event.id;
    const result = await saveEventAction(payload);
    setSaving(false);
    if (result.error) {
      setFormError(result.error);
      return;
    }
    setModal(null);
    router.refresh();
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    setActionError(null);
    const result = await deleteEventAction(id);
    setDeletingId(null);
    if (result.error) {
      setActionError(result.error);
      setPendingDelete(null);
      return;
    }
    setDeletedEventIds((prev) => new Set(prev).add(id));
    setPendingDelete(null);
    router.refresh();
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          {!embedded ? <h1 className={styles.title}>Events</h1> : null}
          <p className={styles.description}>
            Create rides, set slots, and manage sign ups.
          </p>
        </div>
        <button type="button" className={styles.addButton} onClick={openAdd}>
          <PlusIcon size={16} />
          New event
        </button>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}

      <div className={styles.card}>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead className={styles.tableHead}>
              <tr>
                <th className={styles.th}>Event</th>
                <th className={styles.th}>City</th>
                <th className={styles.th}>Date</th>
                <th className={styles.th}>Sign ups</th>
                <th className={styles.th}>Entry</th>
                <th className={styles.th}>Status</th>
                <th className={`${styles.th} ${styles.thRight}`}>Actions</th>
              </tr>
            </thead>
            <tbody className={styles.tableBody}>
              {sorted.map((event) => (
                <tr key={event.id} className={styles.row}>
                  <td className={styles.td}>
                    <Link
                      href={`/events/${event.slug}`}
                      className={styles.eventName}
                    >
                      {event.title}
                    </Link>
                  </td>
                  <td className={styles.td}>{event.location}</td>
                  <td className={styles.td}>
                    <span className={styles.dateCell}>
                      {formatEventDate(event.event_date)}
                    </span>
                  </td>
                  <td className={styles.td}>
                    <span className={styles.signupCount}>
                      {event.slots_booked}
                    </span>
                    <span className={styles.signupTotal}>
                      /{event.capacity}
                    </span>
                  </td>
                  <td className={styles.td}>
                    {event.price > 0 ? formatPeso(event.price) : "Free"}
                  </td>
                  <td className={styles.td}>
                    <span
                      className={`${styles.badge} ${styles[STATUS_BADGE_CLASS[event.status]]}`}
                    >
                      {event.status === "cancelled" ? "closed" : event.status}
                    </span>
                  </td>
                  <td className={styles.td}>
                    <div className={styles.actions}>
<RecordPreviewButton kind="event" record={event}/>
                      <button
                        type="button"
                        onClick={() => openEdit(event)}
                        aria-label={`Edit ${event.title}`}
                        className={`${styles.iconButton} ${styles.editButton}`}
                      >
                        <PencilIcon size={16} />
                      </button>

                      <button
                        type="button"
                        onClick={() => setPendingDelete(event)}
                        aria-label={`Delete ${event.title}`}
                        className={`${styles.iconButton} ${styles.dangerButton}`}
                      >
                        <TrashIcon size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {sorted.length === 0 ? (
          <p className={styles.empty}>
            No events yet. Create your first ride to start taking sign ups.
          </p>
        ) : null}
      </div>
      {modal ? (
        <div className={styles.overlay} role="dialog" aria-modal="true">
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>
                {modal.mode === "edit" ? "Edit event" : "New event"}
              </h2>
              <button
                type="button"
                className={styles.modalClose}
                onClick={closeModal}
                aria-label="Close"
              >
                <CloseIcon size={20} />
              </button>
            </div>

            <form className={styles.form} onSubmit={handleSave}>
              <label className={styles.label}>
                <span>Event name</span>
                <input
                  className={styles.input}
                  value={form.title}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  placeholder="Sunday Family Fun Ride"
                  required
                />
              </label>

              <div className={styles.formRow}>
                <label className={styles.label}>
                  <span>Slug</span>
                  <input
                    className={styles.input}
                    value={form.slug}
                    onChange={(e) => {
                      slugEdited.current = true;
                      updateField("slug", e.target.value);
                    }}
                    placeholder="sunday-family-fun-ride"
                  />
                </label>
                <label className={styles.label}>
                  <span>Discipline</span>
                  <select
                    className={styles.input}
                    value={form.category}
                    onChange={(e) => updateField("category", e.target.value)}
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className={styles.label}>
                <span>Description</span>
                <textarea
                  className={styles.textarea}
                  value={form.description}
                  onChange={(e) => updateField("description", e.target.value)}
                  rows={3}
                />
              </label>

              <div className={styles.formRow}>
                <label className={styles.label}>
                  <span>Date</span>
                  <input
                    type="datetime-local"
                    className={styles.input}
                    value={form.eventDate}
                    onChange={(e) => updateField("eventDate", e.target.value)}
                    required
                  />
                </label>
                <label className={styles.label}>
                  <span>Location</span>
                  <input
                    className={styles.input}
                    value={form.location}
                    onChange={(e) => updateField("location", e.target.value)}
                    placeholder="Marikina City"
                    required
                  />
                </label>
              </div>

              <div className={styles.formRow}>
                <label className={styles.label}>
                  <span>Organizer</span>
                  <input
                    className={styles.input}
                    value={form.organizer}
                    onChange={(e) => updateField("organizer", e.target.value)}
                    placeholder="LnR Cycle Center"
                  />
                </label>
                <label className={styles.label}>
                  <span>Status</span>
                  <select
                    className={styles.input}
                    value={form.status}
                    onChange={(e) =>
                      updateField("status", e.target.value as EventStatus)
                    }
                  >
                    {(["draft", "published", "cancelled"] as const).map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className={styles.formRow}>
                <label className={styles.label}>
                  <span>Price (₱)</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    className={styles.input}
                    value={form.price}
                    onChange={(e) => updateField("price", e.target.value)}
                  />
                </label>
                <label className={styles.label}>
                  <span>Capacity</span>
                  <input
                    type="number"
                    min={0}
                    className={styles.input}
                    value={form.capacity}
                    onChange={(e) => updateField("capacity", e.target.value)}
                  />
                </label>
              </div>

              <label className={styles.label}>
                <span>Banner image</span>
                <div className={styles.uploadBlock}>
                  {form.bannerImageUrl ? (
                    <div className={styles.bannerPreview}>
                      <Image
                        src={form.bannerImageUrl}
                        alt="Banner preview"
                        width={120}
                        height={68}
                        style={{ objectFit: "cover", borderRadius: 8 }}
                      />
                      <button
                        type="button"
                        className={styles.removeImage}
                        onClick={() => updateField("bannerImageUrl", "")}
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <label className={styles.uploadLabel}>
                      <ImageIcon size={16} />
                      {uploading ? "Uploading…" : "Upload banner"}
                      <input
                        ref={fileRef}
                        type="file"
                        accept="image/*"
                        className={styles.hiddenFile}
                        onChange={handleUpload}
                        disabled={uploading}
                      />
                    </label>
                  )}
                </div>
              </label>

              {formError ? <p className={styles.error}>{formError}</p> : null}

              <div className={styles.modalActions}>
                <button
                  type="button"
                  className={styles.cancelButton}
                  onClick={closeModal}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.saveButton}
                  disabled={saving}
                >
                  {saving ? "Saving…" : "Save Event"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
      {pendingDelete ? (
        <div className={styles.overlay} role="dialog" aria-modal="true">
          <div className={styles.modal}>
            <h2 className={styles.modalTitle}>Delete {pendingDelete.title}?</h2>
            <p className={styles.modalDescription}>
              This removes the event from the public site and deletes its rider
              sign ups. Refunds must be issued in GCash separately.
            </p>

            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.cancelButton}
                onClick={() => setPendingDelete(null)}
              >
                Keep event
              </button>
              <button
                type="button"
                className={styles.dangerButtonSolid}
                onClick={() => void handleDelete(pendingDelete.id)}
                disabled={deletingId === pendingDelete.id}
              >
                Delete event
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
