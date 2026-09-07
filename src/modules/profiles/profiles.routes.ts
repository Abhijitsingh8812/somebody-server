import { FastifyInstance } from 'fastify';
import { ProfilesService, UpdateProfileInput } from './profiles.service';
import { NotificationService } from '../notifications/notification.service';
import { authenticate } from '../../middleware/auth.middleware';
import { JwtPayload } from '../../types';

export default async function profilesRoutes(fastify: FastifyInstance) {
  // GET /api/v1/profiles/me (Protected Route)
  fastify.get('/me', { preHandler: [authenticate] }, async (request, reply) => {
    const jwtUser = request.user as JwtPayload;
    try {
      const profile = await ProfilesService.getProfileByUserId(jwtUser.userId);
      return reply.send(profile);
    } catch (err: any) {
      return reply.status(404).send({
        error: {
          code: 'PROFILE_NOT_FOUND',
          message: err.message || 'Profile not found',
        },
      });
    }
  });

  // PATCH /api/v1/profiles/me (Protected Route)
  fastify.patch('/me', { preHandler: [authenticate] }, async (request, reply) => {
    const jwtUser = request.user as JwtPayload;
    const body = request.body as UpdateProfileInput;

    if (!body || typeof body !== 'object') {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request body must be a valid JSON object',
        },
      });
    }

    try {
      const updatedProfile = await ProfilesService.updateProfile(jwtUser.userId, body);
      return reply.send(updatedProfile);
    } catch (err: any) {
      return reply.status(400).send({
        error: {
          code: 'UPDATE_FAILED',
          message: err.message || 'Failed to update profile',
        },
      });
    }
  });

  // POST /api/v1/profiles/push-token (Register device push token)
  fastify.post('/push-token', { preHandler: [authenticate] }, async (request, reply) => {
    const jwtUser = request.user as JwtPayload;
    const body = request.body as { pushToken?: string; platform?: string };

    if (!body?.pushToken || typeof body.pushToken !== 'string') {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'pushToken string is required',
        },
      });
    }

    try {
      const tokenRecord = await NotificationService.registerPushToken(
        jwtUser.userId,
        body.pushToken,
        body.platform || 'android'
      );
      return reply.send({ success: true, token: tokenRecord });
    } catch (err: any) {
      return reply.status(500).send({
        error: {
          code: 'REGISTER_PUSH_TOKEN_FAILED',
          message: err.message || 'Failed to register push token',
        },
      });
    }
  });

  // DELETE /api/v1/profiles/push-token (Unregister device push token)
  fastify.delete('/push-token', { preHandler: [authenticate] }, async (request, reply) => {
    const jwtUser = request.user as JwtPayload;
    const body = request.body as { pushToken?: string };

    if (!body?.pushToken || typeof body.pushToken !== 'string') {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'pushToken string is required',
        },
      });
    }

    try {
      await NotificationService.removePushToken(jwtUser.userId, body.pushToken);
      return reply.send({ success: true });
    } catch (err: any) {
      return reply.status(500).send({
        error: {
          code: 'REMOVE_PUSH_TOKEN_FAILED',
          message: err.message || 'Failed to remove push token',
        },
      });
    }
  });
}
