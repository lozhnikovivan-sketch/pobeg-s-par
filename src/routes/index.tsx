import { createFileRoute } from "@tanstack/react-router";
import { OfficeSprint } from "@/components/office-sprint";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <OfficeSprint />;
}
