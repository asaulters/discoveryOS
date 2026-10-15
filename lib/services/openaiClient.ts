import "server-only";
import { getAuth } from "@/lib/auth";
import OpenAI from "openai";

export async function getOpenAiClient(): Promise<OpenAI> {
  const { role } = await getAuth();
  if (role !== "owner") throw new Error("Owner role required");
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
  return new OpenAI({ apiKey });
}
