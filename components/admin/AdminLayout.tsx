import type { ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import AdminSidebar from "./AdminSidebar";
import AdminHeader from "./AdminHeader";
import { NewOrdersProvider } from "./NewOrdersContext";
import styles from "./AdminLayout.module.css";
import theme from "./AdminTheme.module.css";

type AdminLayoutProps = {
  user: User | null;
  children: ReactNode;
};

/**
 * Reusable shell for every authenticated admin page:
 *
 *   <AdminLayout>
 *     <NewOrdersProvider>   (client – real-time new orders count)
 *       <AdminSidebar />    (fixed 255px left)
 *       <AdminHeader />     (top-right user area)
 *       {children}          (page content)
 *     </NewOrdersProvider>
 *   </AdminLayout>
 *
 * Pages never render the sidebar or header themselves.
 */
export default function AdminLayout({ user, children }: AdminLayoutProps) {
  return (
    <div className={`${styles.shell} ${theme.theme}`}>
      <NewOrdersProvider>
        <AdminSidebar />

        <div className={styles.main}>
          <div className={styles.headerSlot}>
            <AdminHeader user={user} />
          </div>
          <main className={styles.content}>{children}</main>
        </div>
      </NewOrdersProvider>
    </div>
  );
}
