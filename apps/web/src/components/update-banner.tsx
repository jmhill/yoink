import { RefreshCw, X } from 'lucide-react';
import { Button } from '@yoink/ui-base/components/button';
import { cn } from '@yoink/ui-base/lib/utils';

type UpdateBannerProps = {
  onRefresh: () => void;
  onDismiss: () => void;
  isUpdating?: boolean;
};

export const UpdateBanner = ({
  onRefresh,
  onDismiss,
  isUpdating = false,
}: UpdateBannerProps) => {
  return (
    <div className="bg-primary/10 text-primary py-2 px-4 text-sm flex items-center justify-center gap-2">
      <RefreshCw
        className={cn('h-4 w-4 shrink-0', isUpdating && 'animate-spin')}
      />
      <span>A new version is available!</span>
      <Button
        variant="outline"
        size="sm"
        onClick={onRefresh}
        disabled={isUpdating}
        aria-busy={isUpdating}
        className="ml-2 h-7 text-xs"
      >
        {isUpdating ? 'Updating...' : 'Refresh'}
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onDismiss}
        disabled={isUpdating}
        className="h-7 w-7"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
};
