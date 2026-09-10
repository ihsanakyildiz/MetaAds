"use client";

import { LogOut } from "lucide-react";
import { formatDate } from "@/lib/format";

type HeaderProps = {
  title: string;
  description?: string;
};

export function Header({ title, description }: HeaderProps) {
  return (
    <header className="flex shrink-0 items-start justify-between gap-4 border-b border-line bg-card px-8 py-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description ? (
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        ) : null}
      </div>
      <div className="flex items-center gap-3">
        <p className="hidden text-sm text-slate-500 md:block">
          {formatDate(new Date())}
        </p>
        <form action="/api/auth/logout" method="POST">
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-50"
          >
            <LogOut className="h-4 w-4" />
            Çıkış
          </button>
        </form>
      </div>
    </header>
  );
}
