export const parseCreateUserKind = (value: string): 'human' | 'agent' | null => {
  if (value === 'human' || value === 'agent') {
    return value;
  }
  return null;
};

export const parseCreateUserRole = (value: string): 'member' | 'admin' | null => {
  if (value === 'member' || value === 'admin') {
    return value;
  }
  return null;
};
