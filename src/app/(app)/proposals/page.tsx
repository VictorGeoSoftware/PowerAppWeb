"use client";

import { ProposalsComparator } from "@/components/proposals/proposals-table";
import { PROPOSALS_TITLE } from "@/lib/proposals/messages";
import { PageContainer } from "@/components/shell/page-container";

export default function ProposalsPage() {
  return (
    <PageContainer>
      <h1 className="text-[22px] font-semibold">{PROPOSALS_TITLE}</h1>
      <ProposalsComparator />
    </PageContainer>
  );
}
