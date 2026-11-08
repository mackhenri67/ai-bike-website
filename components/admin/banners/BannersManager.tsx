"use client";
import { useRef, useState, type ChangeEvent } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useShop } from "@/components/customer/ShopContext";
import { getAdminBrowserClient } from "@/lib/supabase/client";
import {
  saveHomepageBanner,
  removeHomepageBanner,
} from "@/app/admin/(shell)/dashboard/banner-actions";
import { ImagePlusIcon, Trash2Icon } from "@/components/admin/icons";
import styles from "./BannersManager.module.css";
export default function BannersManager() {
  const { banners } = useShop();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])];
    if (!files.length || busy) return;
    setBusy(true);
    setError(null);
    try {
      for (const file of files) {
        if (
          !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
          file.size > 10 * 1024 * 1024
        )
          throw new Error("Use PNG, JPG or WebP images up to 10MB.");
        const client = getAdminBrowserClient();
        const extension =
          file.type === "image/png"
            ? "png"
            : file.type === "image/webp"
              ? "webp"
              : "jpg";
        const path = `banners/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await client.storage
          .from("images")
          .upload(path, file, { contentType: file.type, upsert: false });
        if (uploadError)
          throw new Error(
            "Image upload failed. Confirm your administrator role and Storage policies.",
          );
        const { data } = client.storage.from("images").getPublicUrl(path);
        const result = await saveHomepageBanner(data.publicUrl);
        if (result.error) throw new Error(result.error);
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Banner upload failed.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  async function remove(url: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await removeHomepageBanner(url);
      if (result.error) throw new Error(result.error);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Banner removal failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Homepage banner images</h1>
          <p className={styles.description}>
            Upload images for the public storefront.
          </p>
        </div>
        <button
          className={styles.uploadButton}
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          <ImagePlusIcon size={16} />
          {busy ? "Saving…" : "Upload images"}
        </button>
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          hidden
          onChange={upload}
        />
      </div>
      {error ? <p role="alert">{error}</p> : null}
      <div className={styles.card}>
        {banners.length ? (
          <div className={styles.grid}>
            {banners.map((url, i) => (
              <div className={styles.tile} key={url}>
                <div className={styles.imageWrap}>
                  <div className={styles.imageInner}>
                    <Image
                      src={url}
                      alt={`Homepage banner ${i + 1}`}
                      fill
                      sizes="(min-width:1024px) 33vw,100vw"
                      className={styles.tileImage}
                    />
                  </div>
                  <span className={styles.badge}>
                    {i === 0 ? "Shown first" : `Slot ${i + 1}`}
                  </span>
                  <button
                    type="button"
                    className={styles.deleteButton}
                    disabled={busy}
                    aria-label={`Remove banner ${i + 1}`}
                    onClick={() => void remove(url)}
                  >
                    <Trash2Icon size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className={styles.empty}>
            No banners yet. Upload a storefront image.
          </p>
        )}
      </div>
    </div>
  );
}
