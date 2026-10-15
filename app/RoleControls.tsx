"use client";

import { createContext, useContext, type ComponentProps, type ReactNode } from "react";

const RoleContext = createContext<string | null>(null);
export function RoleProvider({ role, children }: { role: string | null; children: ReactNode }) {
  return <RoleContext.Provider value={role}>{children}</RoleContext.Provider>;
}
export function OwnerOnly({ children }: { children: ReactNode }) {
  return useContext(RoleContext) === "owner" ? children : null;
}
export function WriteButton({ disabled, title, ...props }: ComponentProps<"button">) {
  const owner = useContext(RoleContext) === "owner";
  return <button {...props} disabled={!owner || disabled} title={owner ? title : "Owner role required"} />;
}
export function WriteInput({ disabled, ...props }: ComponentProps<"input">) {
  return <input {...props} disabled={useContext(RoleContext) !== "owner" || disabled} />;
}
export function WriteSelect({ disabled, ...props }: ComponentProps<"select">) {
  return <select {...props} disabled={useContext(RoleContext) !== "owner" || disabled} />;
}
export function WriteTextarea({ disabled, ...props }: ComponentProps<"textarea">) {
  return <textarea {...props} disabled={useContext(RoleContext) !== "owner" || disabled} />;
}
