import { Router } from 'express';
import * as controller from '../controllers/channel-allocation.controller.js';
import { requireAdminRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  allocateSchema,
  deallocateSchema,
  listAllocationsSchema,
} from '../validation/channel-allocation.schemas.js';

export const channelAllocations = Router();

channelAllocations.get('/', validate(listAllocationsSchema), controller.list);
channelAllocations.post('/allocate', requireAdminRole, validate(allocateSchema), controller.allocate);
channelAllocations.post('/deallocate', requireAdminRole, validate(deallocateSchema), controller.deallocate);
