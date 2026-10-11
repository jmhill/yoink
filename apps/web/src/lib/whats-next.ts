export type WhatsNextPrompt = {
  projectId: string;
  projectName: string;
  completedTaskId: string;
};

type Listener = (prompt: WhatsNextPrompt | null) => void;

const listeners = new Set<Listener>();

export const subscribeWhatsNext = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const offerWhatsNext = (prompt: WhatsNextPrompt): void => {
  for (const listener of listeners) {
    listener(prompt);
  }
};

export const dismissWhatsNext = (): void => {
  for (const listener of listeners) {
    listener(null);
  }
};
