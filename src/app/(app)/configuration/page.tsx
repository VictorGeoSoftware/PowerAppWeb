"use client";

import { ProposalVisibilityList } from "@/components/proposals/proposal-visibility-list";
import { PageContainer } from "@/components/shell/page-container";

export default function ConfigurationPage() {
  return (
    // The list renders its own section with vertical padding.
    <PageContainer className="py-0">
      <ProposalVisibilityList />
    </PageContainer>
  );
}
