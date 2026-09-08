import { FastifyInstance } from 'fastify';
import { ConnectionsService } from './connections.service';
import { authenticate } from '../../middleware/auth.middleware';
import { JwtPayload } from '../../types';

export default async function connectionsRoutes(fastify: FastifyInstance) {
  // POST /api/v1/connections/request
  fastify.post('/request', { preHandler: [authenticate] }, async (request, reply) => {
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
      const conn = await ConnectionsService.requestConnection(jwtUser.userId, body.userId);
      console.log('[CONNECTION] Request created:', conn.id, 'status:', conn.status);
      return reply.send(conn);
    } catch (err: any) {
      console.error('[CONNECTION] Request failed:', err.message);
      return reply.status(400).send({
        error: {
          code: 'CONNECTION_FAILED',
          message: err.message || 'Failed to send connection request',
        },
      });
    }
  });

  // GET /api/v1/connections/relationship/:userId
  fastify.get('/relationship/:userId', { preHandler: [authenticate] }, async (request, reply) => {
    const jwtUser = request.user as JwtPayload;
    const { userId } = request.params as { userId: string };

    try {
      const result = await ConnectionsService.getRelationshipStatus(jwtUser.userId, userId);
      return reply.send(result);
    } catch (err: any) {
      return reply.status(500).send({
        error: {
          code: 'RELATIONSHIP_FETCH_FAILED',
          message: err.message || 'Failed to fetch relationship status',
        },
      });
    }
  });

  // GET /api/v1/connections
  fastify.get('/', { preHandler: [authenticate] }, async (request, reply) => {
    const jwtUser = request.user as JwtPayload;
    try {
      const result = await ConnectionsService.getConnections(jwtUser.userId);
      return reply.send(result);
    } catch (err: any) {
      return reply.status(500).send({
        error: {
          code: 'FETCH_FAILED',
          message: err.message || 'Failed to fetch connections',
        },
      });
    }
  });

  // POST /api/v1/connections/:id/accept
  fastify.post('/:id/accept', { preHandler: [authenticate] }, async (request, reply) => {
    const jwtUser = request.user as JwtPayload;
    const { id } = request.params as { id: string };

    try {
      console.log('[CONNECTION] Accept request - connectionId:', id, 'by userId:', jwtUser.userId);
      const result = await ConnectionsService.acceptConnection(id, jwtUser.userId);
      console.log('[CONNECTION] Accept success - status:', result.status);
      return reply.send(result);
    } catch (err: any) {
      console.error('[CONNECTION] Accept failed - connectionId:', id, 'error:', err.message);
      return reply.status(400).send({
        error: {
          code: 'ACCEPT_FAILED',
          message: err.message || 'Failed to accept connection',
        },
      });
    }
  });

  // POST /api/v1/connections/:id/reject
  fastify.post('/:id/reject', { preHandler: [authenticate] }, async (request, reply) => {
    const jwtUser = request.user as JwtPayload;
    const { id } = request.params as { id: string };

    try {
      console.log('[CONNECTION] Reject request - connectionId:', id, 'by userId:', jwtUser.userId);
      const result = await ConnectionsService.rejectConnection(id, jwtUser.userId);
      console.log('[CONNECTION] Reject success - status:', result.status);
      return reply.send(result);
    } catch (err: any) {
      console.error('[CONNECTION] Reject failed - connectionId:', id, 'error:', err.message);
      return reply.status(400).send({
        error: {
          code: 'REJECT_FAILED',
          message: err.message || 'Failed to reject connection',
        },
      });
    }
  });

  // DELETE /api/v1/connections/:id
  fastify.delete('/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const jwtUser = request.user as JwtPayload;
    const { id } = request.params as { id: string };

    try {
      const result = await ConnectionsService.deleteConnection(id, jwtUser.userId);
      return reply.send(result);
    } catch (err: any) {
      return reply.status(400).send({
        error: {
          code: 'DELETE_FAILED',
          message: err.message || 'Failed to delete connection',
        },
      });
    }
  });
}
