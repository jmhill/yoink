# Optimistic Updates Pattern

This document describes the pattern for implementing optimistic updates with TanStack Query v5 and ts-rest.

## Overview

Optimistic updates make the UI feel instant by updating the cache before the server responds, with automatic rollback on error.

## Pattern

```typescript
const archiveMutation = tsr.update.useMutation({
  onMutate: async ({ params }) => {
    // 1. Cancel in-flight queries
    await tsrQueryClient.invalidateQueries({ queryKey: ['captures'] });
    
    // 2. Snapshot for rollback
    const previousInbox = tsrQueryClient.list.getQueryData(['captures', 'inbox']);
    
    // 3. Optimistically update cache
    if (previousInbox?.status === 200) {
      tsrQueryClient.list.setQueryData(['captures', 'inbox'], {
        ...previousInbox,
        body: {
          ...previousInbox.body,
          captures: previousInbox.body.captures.filter(c => c.id !== params.id),
        },
      });
    }
    
    return { previousInbox };
  },
  
  onError: (_err, _variables, context) => {
    // 4. Rollback on error
    if (context?.previousInbox) {
      tsrQueryClient.list.setQueryData(['captures', 'inbox'], context.previousInbox);
    }
  },
  
  onSettled: () => {
    // 5. Refetch to ensure consistency
    tsrQueryClient.invalidateQueries({ queryKey: ['captures'] });
  },
});
```

## Mutations to Update

| Location | Mutation | Notes |
|----------|----------|-------|
| `web/index.tsx` | create | Use temp ID until server responds |
| `web/index.tsx` | archive | Move between inbox/archived caches |
| `web/archived.tsx` | unarchive | Mirror of archive |
| `admin/index.tsx` | createOrganization | Simple append |
| `admin/organizations.$orgId.tsx` | createUser, updateOrganization | Simple append/update |
| `admin/users.$userId.tsx` | createToken, revokeToken | Token creation shows modal with raw token |

## Estimated Effort

~2 hours total to implement across all mutations.
