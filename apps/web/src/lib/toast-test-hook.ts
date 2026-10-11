import { toast } from 'sonner';

/** Installed on `window` so E2E can dismiss toasts without ripping React nodes. */
export const DISMISS_TOASTS_TEST_KEY = '__YOINK_DISMISS_TOASTS';

type ToastTestWindow = Window & {
  [DISMISS_TOASTS_TEST_KEY]?: () => void;
};

export const installToastTestHook = (): void => {
  if (typeof window === 'undefined') {
    return;
  }
  const target = window as ToastTestWindow;
  target[DISMISS_TOASTS_TEST_KEY] = () => {
    toast.dismiss();
  };
};
