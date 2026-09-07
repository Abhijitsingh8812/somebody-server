import { FastifyInstance } from 'fastify';
import { UsersService } from './users.service';
import { authenticate } from '../../middleware/auth.middleware';
import { JwtPayload } from '../../types';

export default async function usersRoutes(fastify: FastifyInstance) {
  // GET /api/v1/users/code/:uniqueCode
  fastify.get('/code/:uniqueCode', { preHandler: [authenticate] }, async (request, reply) => {
    const jwtUser = request.user as JwtPayload;
    const { uniqueCode } = request.params as { uniqueCode: string };

    try {
      const user = await UsersService.getUserByUniqueCode(uniqueCode, jwtUser.userId);
      return reply.send(user);
    } catch (err: any) {
      return reply.status(404).send({
        error: {
          code: 'USER_NOT_FOUND',
          message: err.message || 'User not found',
        },
      });
    }
  });

  // GET /api/v1/users/search?q=query
  fastify.get('/search', { preHandler: [authenticate] }, async (request, reply) => {
    const jwtUser = request.user as JwtPayload;
    const { q } = request.query as { q?: string };

    if (!q || q.trim().length < 2) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Search query must be at least 2 characters long',
        },
      });
    }

    try {
      const results = await UsersService.searchUsers(q, jwtUser.userId);
      return reply.send(results);
    } catch (err: any) {
      return reply.status(400).send({
        error: {
          code: 'SEARCH_FAILED',
          message: err.message || 'Search failed',
        },
      });
    }
  });
}
