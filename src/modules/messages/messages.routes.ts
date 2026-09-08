import { FastifyInstance } from 'fastify';
import { MessagesService } from './messages.service';
import { authenticate } from '../../middleware/auth.middleware';
import { JwtPayload } from '../../types';

export default async function messagesRoutes(fastify: FastifyInstance) {
  // GET /api/v1/messages/:messageId/audio
  fastify.get('/:messageId/audio', { preHandler: [authenticate] }, async (request, reply) => {
    const jwtUser = request.user as JwtPayload;
    const { messageId } = request.params as { messageId: string };

    try {
      const audio = await MessagesService.getVoiceAudio(messageId, jwtUser.userId);

      return reply
        .header('Content-Type', audio.mimeType)
        .header('Content-Length', audio.sizeBytes)
        .header('Cache-Control', 'private, no-cache, no-store, must-revalidate')
        .send(audio.audioData);
    } catch (err: any) {
      const statusCode = err.statusCode || 500;
      return reply.status(statusCode).send({
        error: {
          code: err.code || 'AUDIO_FETCH_FAILED',
          message: err.message || 'Failed to fetch audio stream',
        },
      });
    }
  });
}
