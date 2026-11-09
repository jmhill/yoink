import type { Capture as ContractCapture } from '@yoink/api-contracts';
import type { Capture } from '../../../modules/captures/index.js';
import type { ListedPage } from '../../../kernel/listing/domain/listed-page.js';
import { toCaptureListBody } from '../../_shared/http-listed-page.js';

/**
 * Copy a capture document onto the contract capture.
 * Optional fields stay absent when the document omits them, which keeps the
 * JSON key order of the document the module already returns.
 */
export const toContractCapture = (capture: Capture): ContractCapture => ({
  id: capture.id,
  organizationId: capture.organizationId,
  createdById: capture.createdById,
  content: capture.content,
  ...(capture.title !== undefined ? { title: capture.title } : {}),
  ...(capture.sourceUrl !== undefined ? { sourceUrl: capture.sourceUrl } : {}),
  ...(capture.sourceApp !== undefined ? { sourceApp: capture.sourceApp } : {}),
  status: capture.status,
  capturedAt: capture.capturedAt,
  ...(capture.trashedAt !== undefined ? { trashedAt: capture.trashedAt } : {}),
  ...(capture.snoozedUntil !== undefined ? { snoozedUntil: capture.snoozedUntil } : {}),
  ...(capture.processedAt !== undefined ? { processedAt: capture.processedAt } : {}),
  ...(capture.processedToType !== undefined ? { processedToType: capture.processedToType } : {}),
  ...(capture.processedToId !== undefined ? { processedToId: capture.processedToId } : {}),
});

export const toContractCaptureList = (page: ListedPage<Capture>) =>
  toCaptureListBody({
    items: page.items.map(toContractCapture),
    hasMore: page.hasMore,
    nextCursor: page.nextCursor,
    total: page.total,
  });
