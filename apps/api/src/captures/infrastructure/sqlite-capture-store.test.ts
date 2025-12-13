import { describe } from 'vitest';
import { createSqliteCaptureStore } from './sqlite-capture-store.js';
import { runCaptureStoreContractTests } from '../domain/capture-store.contract.js';

describe('SqliteCaptureStore', () => {
  runCaptureStoreContractTests({
    createStore: () => createSqliteCaptureStore({ location: ':memory:' }),
  });
});
