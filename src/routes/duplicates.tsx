import { createFileRoute, redirect } from "@tanstack/react-router";

/** Duplicate review now lives inside the Exception Center. */
export const Route = createFileRoute("/duplicates")({
  beforeLoad: () => {
    throw redirect({ to: "/exceptions", search: { tab: "duplicates" } });
  },
});
