import { z } from "zod";
export const PROJECT_FILE_BUCKET = "project-files";
export const MAX_PROJECT_FILE_BYTES = 25 * 1024 * 1024;
const fields = {
  name: z.string().trim().min(1).max(500),
  description: z.string().max(20000).nullable().optional(),
};
export const attachmentInput = z.discriminatedUnion("kind", [
  z
    .object({
      ...fields,
      kind: z.literal("file"),
      size_bytes: z.number().int().min(1).max(MAX_PROJECT_FILE_BYTES),
      content_type: z.string().max(255).optional(),
    })
    .strict(),
  z
    .object({
      ...fields,
      kind: z.literal("link"),
      url: z
        .url()
        .max(4000)
        .refine((s) => {
          const u = new URL(s);
          return u.protocol === "https:" && !u.username && !u.password;
        }, "Use an HTTPS link without embedded credentials"),
    })
    .strict(),
]);
export const attachmentPatch = z.union([
  z.object({ action: z.literal("complete") }).strict(),
  z.object({ archived: z.boolean() }).strict(),
]);
export function safeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-180) || "attachment";
}
