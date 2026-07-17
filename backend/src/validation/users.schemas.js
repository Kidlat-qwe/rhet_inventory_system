import { z } from 'zod';

export const createUserSchema = z.object({
  body: z.object({
    email: z.string().trim().email().max(254),
    fullName: z.string().trim().min(2).max(150),
    password: z.string().min(6).max(128),
    role: z.enum(['ADMIN', 'USER']).default('USER'),
  }),
  query: z.any(),
  params: z.any(),
});

export const updateUserRoleSchema = z.object({
  body: z.object({
    role: z.enum(['ADMIN', 'USER']),
  }),
  query: z.any(),
  params: z.object({
    id: z.string().uuid(),
  }),
});
