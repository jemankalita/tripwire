import type { Metadata } from "next";
import { WatchDetailView } from "@/components/app/detail/WatchDetailView";

export const metadata: Metadata = { title: "Watch" };

export default async function WatchPage({ params }: PageProps<"/app/w/[id]">) {
  const { id } = await params;
  return <WatchDetailView id={id} />;
}
