import { RefreshCw, X } from 'lucide-react';
import { Button } from '@yoink/ui-base/components/button';

type UpdateBannerProps = {
  onRefresh: () => void;
  onDismiss: () => void;
};

export const UpdateBanner = ({ onRefresh, onDismiss }: UpdateBannerProps) => {
  return (
    <div className="bg-blue-100 text-blue-800 py-2 px-4 text-sm flex items-center justify-center gap-2">
      <RefreshCw className="h-4 w-4 shrink-0" />
      <span>A new version is available!</span>
      <Button
        variant="outline"
        size="sm"
        onClick={onRefresh}
        className="ml-2 h-7 text-xs bg-blue-50 border-blue-300 hover:bg-blue-200"
      >
        Refresh
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onDismiss}
        className="h-7 w-7 hover:bg-blue-200"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
};
