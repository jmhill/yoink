import { PILE_SAFETY_CAP } from '@yoink/api-contracts';
import { tsr, tsrProjects } from '@/api/client';
import { processBadgeCount } from '@/lib/mobile-tabs';
import { processBadgeTotal } from '@/lib/process-queue';

export function useProcessCounts() {
  const inboxQuery = tsr.list.useQuery({
    queryKey: ['captures', 'inbox'],
    queryData: { query: { status: 'inbox', snoozed: false, limit: PILE_SAFETY_CAP } },
  });
  const proposalsQuery = tsrProjects.list.useQuery({
    queryKey: ['projects', 'proposed'],
    queryData: { query: { status: 'proposed', limit: PILE_SAFETY_CAP } },
  });

  const inboxCount = inboxQuery.data?.status === 200 ? inboxQuery.data.body.total : 0;
  const proposalCount = proposalsQuery.data?.status === 200 ? proposalsQuery.data.body.total : 0;
  const proposals = proposalsQuery.data?.status === 200 ? proposalsQuery.data.body.projects : [];
  const total = processBadgeTotal(inboxCount, proposalCount);

  return {
    inboxQuery,
    proposalsQuery,
    inboxCount,
    proposalCount,
    proposals,
    total,
    badge: processBadgeCount(total),
  };
}
