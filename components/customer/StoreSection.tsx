import { STORE_INFO } from "./data";
import { MapPinIcon } from "./icons";
import styles from "./StoreSection.module.css";

/**
 * Store information + map. Left column holds the store details and a
 * directions button. The embedded map supports panning and zooming.
 */
export default function StoreSection() {
  const destination = [STORE_INFO.name, STORE_INFO.addressLine1, STORE_INFO.addressLine2].join(" ");
  const mapQuery = encodeURIComponent(destination);
  const mapUrl = `https://www.google.com/maps?q=${mapQuery}&z=16&output=embed`;
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${mapQuery}`;
  return (
    <section className={styles.section}>
      <div className={styles.container}>
        <div className={styles.info}>
          <h2 className={styles.storeTitle}>{STORE_INFO.name}</h2>
          <p className={styles.address}>
            {STORE_INFO.addressLine1}
            <br />
            {STORE_INFO.addressLine2}
          </p>
          <p className={styles.hours}>{STORE_INFO.hours}</p>
          <a
            href={directionsUrl}
            target="_blank"
            rel="noreferrer"
            className={styles.directions}
          >
            <MapPinIcon size={13} />
            DIRECTIONS
          </a>
        </div>

        <div className={styles.mapWrap}>
          <iframe
            src={mapUrl}
            title={`Interactive map of ${STORE_INFO.name}, Tabaco City`}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            allowFullScreen
            className={styles.mapFrame}
          />
        </div>
      </div>
    </section>
  );
}
