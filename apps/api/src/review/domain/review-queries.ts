export type ListReviewQuery = {
  organizationId: string;
  limit?: number;
  cursor?: string;
  timeZone?: string;
};

export type ListDoneQuery = {
  organizationId: string;
  week?: string;
  limit?: number;
  cursor?: string;
};
