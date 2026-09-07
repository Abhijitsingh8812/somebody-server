import { FastifyInstance } from 'fastify';
import { BlocksService } from './blocks.service';
import { authenticate } from '../../middleware/auth.middleware';
import { JwtPayload } from '../../types';

export default async function blocksRoutes(fastify: FastifyInstance) {
  // POST /api/v1/blocks
  fastify.post('/', { preHandler: [authenticate] }, async (request, reply) => {
    const jwtUser = request.user as JwtPayload;
    const body = request.body as { userId?: string };

    if (!body?.userId) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Target userId is required',
        },
      });
    }

    try {
      const result = await BlocksService.blockUser(jwtUser.userId, body.userId);
      return reply.send(result);
    } catch (err: any) {
      return reply.status(400).send({
        error: {
          code: 'BLOCK_FAILED',
          message: err.message || 'Failed to block user',
        },
      });
    }
  });

  // DELETE /api/v1/blocks/:userId
  fastify.delete('/:userId', { preHandler: [authenticate] }, async (request, reply) => {
    const jwtUser = request.user as JwtPayload;
    const { userId } = request.params as { userId: string };

    try {
      const result = await BlocksService.unblockUser(jwtUser.userId, userId);
      return reply.send(result);
    } catch (err: any) {
      return reply.status(400).send({
        error: {
          code: 'UNBLOCK_FAILED',
          message: err.message || 'Failed to unblock user',
        },
      });
    }
  });

  // GET /api/v1/blocks
  fastify.get('/', { preHandler: [authenticate] }, async (request, reply) => {
    const jwtUser = request.user as JwtPayload;

    try {
      const list = await BlocksService.getBlockedUsers(jwtUser.userId);
      return reply.send(list);
    } catch (err: any) {
      return reply.status(500).send({
        error: {
          code: 'FETCH_FAILED',
          message: err.message || 'Failed to fetch blocked users',
        },
      });
    }
  });
}
