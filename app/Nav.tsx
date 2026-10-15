"use client";

import { OwnerOnly } from "./RoleControls";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Sprint 21: deliberately short. Meeting-specific navigation (Brief/Live/
 * Workflow/Review/Share/Evaluate/Debug) lives in each meeting page's own
 * MeetingHeader now, not duplicated here - this bar is only for the
 * handful of surfaces that exist outside any one meeting.
 */
function NavLink({
  href,
  label,
  title,
  active,
}: {
  href: string;
  label: string;
  title?: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      title={title}
      className={
        active
          ? "font-semibold text-neutral-900 dark:text-neutral-100"
          : "text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
      }
    >
      {label}
    </Link>
  );
}

export default function Nav({
  signedIn,
  role,
}: {
  signedIn: boolean;
  role: string | null;
}) {
  const pathname = usePathname();

  if (pathname === "/login") return null;

  return (
    <header className="border-b border-neutral-200 bg-white px-4 py-2 dark:border-neutral-800 dark:bg-neutral-900">
      <nav className="mx-auto flex max-w-5xl flex-wrap items-center gap-4 text-sm">
        <Link href="/" className="font-semibold">
          DiscoveryOS
        </Link>
        <NavLink
          href="/my-week"
          label="My week"
          active={pathname === "/my-week"}
        />
        <NavLink
          href="/projects"
          label="Projects"
          active={pathname.startsWith("/projects")}
        />
        <NavLink
          href="/"
          label="Dashboard"
          title="All meetings"
          active={pathname === "/"}
        />
        <OwnerOnly>
          <NavLink
            href="/meetings/new"
            label="New Meeting"
            active={pathname === "/meetings/new"}
          />
        </OwnerOnly>
        <NavLink
          href="/pilot"
          label="Pilot"
          title="Real-use feedback"
          active={pathname === "/pilot"}
        />
        <NavLink
          href="/regression"
          label="Regression"
          title="Scenario QA"
          active={pathname === "/regression"}
        />
        {signedIn && (
          <span className="ml-auto text-xs text-neutral-500">
            {role === "owner" ? "Owner" : "Viewer (read only)"}
          </span>
        )}
        {signedIn && (
          <form action="/auth/signout" method="post">
            <button type="submit">Sign out</button>
          </form>
        )}
      </nav>
    </header>
  );
}
