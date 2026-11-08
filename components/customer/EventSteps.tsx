import styles from "./EventSteps.module.css";
export default function EventSteps({ current }: { current: 1 | 2 | 3 }) {
  return <ol className={styles.steps} aria-label="Registration progress">
    {["Rider details", "Online payment", "E-ticket"].map((label, index) => <li key={label} className={index + 1 === current ? styles.current : index + 1 < current ? styles.done : styles.waiting} aria-current={index + 1 === current ? "step" : undefined}><span>{index + 1}</span>{label}</li>)}
  </ol>;
}
