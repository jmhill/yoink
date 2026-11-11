import { useQuery } from '@tanstack/react-query';
import { PILE_SAFETY_CAP } from '@yoink/api-contracts';
import { inboxClient, projectClient } from '@/api/client';
import { processBadgeCount } from '@/lib/mobile-tabs';
import { processBadgeTotal } from '@/lib/process-queue';

export function useProcessCounts() {
  const inboxQuery = useQuery({
    queryKey: ['captures', 'inbox'],
    queryFn: () =>
      inboxClient.list({ status: 'inbox', snoozed: false, limit: PILE_SAFETY_CAP }),
  });
  const proposalsQuery = useQuery({
    queryKey: ['projects', 'proposed'],
    queryFn: () => projectClient.list({ status: 'proposed', limit: PILE_SAFETY_CAP }),
  });

  const inboxCount = inboxQuery.data?.total ?? 0;
  const proposalCount = proposalsQuery.data?.total ?? 0;
  const proposals = proposalsQuery.data?.projects ?? [];
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
