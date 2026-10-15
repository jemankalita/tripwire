import type { Metadata } from "next";
import { Inbox } from "@/components/app/Inbox";

export const metadata: Metadata = { title: "Inbox" };

export default function InboxPage() {
  return <Inbox />;
}
