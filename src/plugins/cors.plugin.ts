import fp from 'fastify-plugin';
import fastifyCors from '@fastify/cors';
import { config } from '../config';

export default fp(async (fastify) => {
  await fastify.register(fastifyCors, {
    origin: config.allowedOrigins === '*' ? true : config.allowedOrigins.split(','),
    credentials: true,
  });
});
