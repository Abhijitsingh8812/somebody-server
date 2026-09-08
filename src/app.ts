import Fastify from 'fastify';
import socketio from 'fastify-socket.io';
import rateLimit from '@fastify/rate-limit';
import corsPlugin from './plugins/cors.plugin';
import jwtPlugin from './plugins/jwt.plugin';
import authRoutes from './modules/auth/auth.routes';
import profilesRoutes from './modules/profiles/profiles.routes';
import usersRoutes from './modules/users/users.routes';
import connectionsRoutes from './modules/connections/connections.routes';
import blocksRoutes from './modules/blocks/blocks.routes';
import chatsRoutes from './modules/chats/chats.routes';
import messagesRoutes from './modules/messages/messages.routes';
import { SocketService } from './services/realtime/socket.service';
import { config } from './config';
import { getDb } from './database';
import { sql } from 'drizzle-orm';

export const buildApp = () => {
  const app = Fastify({
    logger: {
      level: config.nodeEnv === 'production' ? 'info' : 'debug',
    },
  });

  // Register Core Plugins
  app.register(corsPlugin);
  app.register(jwtPlugin);
  app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });
  app.register(socketio, {
    cors: {
      origin: config.allowedOrigins === '*' ? true : config.allowedOrigins.split(','),
      methods: ['GET', 'POST'],
    },
  });

  // Raw binary parser for audio uploads
  app.addContentTypeParser(
    ['audio/m4a', 'audio/mp4', 'audio/aac', 'audio/mpeg', 'application/octet-stream'],
    { parseAs: 'buffer' },
    (req, body, done) => {
      done(null, body);
    }
  );

  // Hardened JSON body parser: tolerates empty bodies (returns {}) instead of
  // throwing "Body cannot be empty when content-type is application/json".
  // This protects bodyless action POSTs (e.g. accept/reject) from misbehaving clients.
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    if (!body || (body as string).trim() === '') {
      return done(null, {});
    }
    try {
      done(null, JSON.parse(body as string));
    } catch (err: any) {
      err.statusCode = 400;
      done(err, undefined);
    }
  });

  // Health Check Endpoint
  app.get('/health', async (request, reply) => {
    let dbStatus = 'disconnected';
    try {
      const db = getDb();
      await db.execute(sql`SELECT 1`);
      dbStatus = 'connected';
    } catch {
      dbStatus = 'disconnected';
    }

    return reply.send({
      status: 'ok',
      service: 'somebody-api',
      database: dbStatus,
      timestamp: new Date().toISOString(),
    });
  });

  // Register API Route Modules
  app.register(authRoutes, { prefix: '/api/v1/auth' });
  app.register(profilesRoutes, { prefix: '/api/v1/profiles' });
  app.register(usersRoutes, { prefix: '/api/v1/users' });
  app.register(connectionsRoutes, { prefix: '/api/v1/connections' });
  app.register(blocksRoutes, { prefix: '/api/v1/blocks' });
  app.register(chatsRoutes, { prefix: '/api/v1/chats' });
  app.register(messagesRoutes, { prefix: '/api/v1/messages' });

  // Global Error Handler
  app.setErrorHandler((error, request, reply) => {
    app.log.error(error);
    const statusCode = error.statusCode || 500;
    reply.status(statusCode).send({
      error: {
        code: error.name || 'INTERNAL_SERVER_ERROR',
        message: config.nodeEnv === 'production' && statusCode === 500
          ? 'An unexpected internal server error occurred'
          : error.message,
      },
    });
  });

  // Post-registration hook to initialize SocketService
  app.ready((err) => {
    if (!err) {
      SocketService.initialize(app);
    }
  });

  return app;
};
