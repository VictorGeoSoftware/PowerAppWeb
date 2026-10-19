"use client";

import { ProposalsComparator } from "@/components/proposals/proposals-table";
import { PROPOSALS_TITLE } from "@/lib/proposals/messages";

export default function ProposalsPage() {
  return (
    <section className="flex flex-col gap-4 py-4">
      <h1 className="text-[22px] font-semibold">{PROPOSALS_TITLE}</h1>
      <ProposalsComparator />
    </section>
  );
}
