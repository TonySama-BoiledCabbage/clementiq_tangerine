import { redirect } from "next/navigation";

/** ui-redesign: the Stress Test is the home screen; the original overview is no longer linked. */
export default function Home() {
  redirect("/judge");
}
