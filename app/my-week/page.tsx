import { getTracker } from "@/lib/services/tracker";
import { getAuth } from "@/lib/auth";
import MyWeekClient from "./MyWeekClient";
export default async function MyWeekPage() {
  const [initial, auth] = await Promise.all([getTracker(), getAuth()]);
  return <MyWeekClient initial={initial} userId={auth.userId!} />;
}
