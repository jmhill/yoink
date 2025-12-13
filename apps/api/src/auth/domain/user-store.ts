import type { User } from './user.js';

export type UserStore = {
  save(user: User): Promise<void>;
  findById(id: string): Promise<User | null>;
};
