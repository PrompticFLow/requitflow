import { redirect } from "next/navigation";

export default function PersonLeadsRedirectPage() {
  redirect("/dashboard/leads");
}
