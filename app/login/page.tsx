"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      const { error } = await createBrowserSupabaseClient().auth.signInWithPassword({
        email: String(form.get("email")), password: String(form.get("password")),
      });
      if (error) { setError("Unable to sign in. Check your email and password."); return; }
      router.push("/my-week");
      router.refresh();
    } catch { setError("Unable to reach sign-in. Please try again."); }
    finally { setBusy(false); }
  }
  return (
    <main className="mx-auto w-full max-w-sm px-6 py-12">
      <h1 className="mb-6 text-2xl font-semibold">Sign in to DiscoveryOS</h1>
      <form onSubmit={login} className="flex flex-col gap-4">
        <label>Email<input className="mt-1 w-full rounded border p-2" name="email" type="email" autoComplete="username" required /></label>
        <label>Password<input className="mt-1 w-full rounded border p-2" name="password" type="password" autoComplete="current-password" required /></label>
        {error && <p role="alert">{error}</p>}
        <button className="rounded bg-blue-700 p-2 text-white disabled:opacity-50" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      </form>
    </main>
  );
}
