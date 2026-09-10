import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { Sidebar } from "@/components/layout/sidebar";
import { requireUser } from "@/lib/auth";
import { SIDEBAR_COLLAPSED, SIDEBAR_COOKIE } from "@/lib/sidebar";

export default async function PanelLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireUser();
  const cookieStore = await cookies();
  const collapsed =
    cookieStore.get(SIDEBAR_COOKIE)?.value === SIDEBAR_COLLAPSED;

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar
        user={{
          name: user.name,
          email: user.email,
          role: user.role,
        }}
        initialCollapsed={collapsed}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {children}
      </div>
    </div>
  );
}
