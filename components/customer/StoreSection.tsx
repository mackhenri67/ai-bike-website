import { STORE_INFO } from "./data";
import StoreMap from "./StoreMap";
import { STORE_COORDINATES } from "@/lib/store-location";
import { MapPinIcon } from "./icons";
import styles from "./StoreSection.module.css";

/**
 * Store information + map. Left column holds the store details and a
 * directions button. The embedded map supports panning and zooming.
 */
export default function StoreSection() {
  const { latitude, longitude } = STORE_COORDINATES;
  const directionsUrl = `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=;${latitude},${longitude}`;
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
          <StoreMap/>
        </div>
      </div>
    </section>
  );
}
