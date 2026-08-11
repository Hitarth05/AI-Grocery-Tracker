import { redirect } from "next/navigation";

/** The item list is the home screen — open the app, see what's expiring. */
export default function Home() {
  redirect("/items");
}
