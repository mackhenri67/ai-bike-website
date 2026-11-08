import Image from "next/image";
import { MAP_SRC, STORE_INFO } from "./data";
import { MapPinIcon } from "./icons";
import styles from "./StoreSection.module.css";

/**
 * Store information + map. Left column holds the store details and a
 * DIRECTIONS button (plain Google Maps search link — no map library), right
 * column shows the provided map image.
 */
export default function StoreSection() {
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
            href={STORE_INFO.directionsUrl}
            target="_blank"
            rel="noreferrer"
            className={styles.directions}
          >
            <MapPinIcon size={13} />
            DIRECTIONS
          </a>
        </div>

        <div className={styles.mapWrap}>
          <Image
            src={MAP_SRC}
            alt={`Map showing the location of ${STORE_INFO.name}`}
            fill
            sizes="(max-width: 900px) 90vw, 720px"
            className={styles.mapImage}
          />
        </div>
      </div>
    </section>
  );
}
