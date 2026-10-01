import { receiveRum } from '../../server/rum.ts';
import type { RumEnvironment } from '../../server/rum.ts';
export const onRequest = ({ request, env }: { request: Request; env: RumEnvironment }) => receiveRum(request, env);
