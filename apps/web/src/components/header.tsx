import { Link } from '@tanstack/react-router';
import { Button } from '@yoink/ui-base/components/button';
import { Settings } from 'lucide-react';

export function Header() {
  return (
    <div className="mb-6 flex items-center justify-between">
      <Link to="/" title="Yoink">
        <img src="/icon-192x192.png" alt="Yoink" className="h-10 w-10 rounded-lg" />
      </Link>
      <Button variant="ghost" size="icon" asChild title="Settings">
        <Link to="/settings">
          <Settings className="size-8" />
        </Link>
      </Button>
    </div>
  );
}
