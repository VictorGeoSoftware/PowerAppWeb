import { redirect } from "next/navigation";
import { HOME_ROUTE } from "@/components/shell/menu-entries";

/** Signed-in entry point; `(app)/layout.tsx` sends signed-out visitors to /login. */
export default function Home() {
  redirect(HOME_ROUTE);
}
