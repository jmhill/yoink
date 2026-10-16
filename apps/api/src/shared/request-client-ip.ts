import type { FastifyRequest } from 'fastify';
import { decideClientIp, firstHeaderValue } from './rate-limit-policy.js';

export type ClientIpOf = (request: FastifyRequest) => string;

export const clientIpOfRequest = (request: FastifyRequest, viaFly: boolean): string =>
  decideClientIp({
    remoteAddress: request.socket.remoteAddress,
    flyClientIp: firstHeaderValue(request.headers['fly-client-ip']),
    viaFly,
  }).ip;
