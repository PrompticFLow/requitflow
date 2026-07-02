import { redirect } from "next/navigation";

export default function CompaniesHiringRedirectPage() {
  redirect("/dashboard/person-leads");
}
