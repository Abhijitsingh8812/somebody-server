import fp from 'fastify-plugin';
import fastifyJwt from '@fastify/jwt';
import { config } from '../config';

export default fp(async (fastify) => {
  await fastify.register(fastifyJwt, {
    secret: config.jwt.accessSecret,
    sign: {
      expiresIn: config.jwt.accessExpiry,
    },
  });
});
