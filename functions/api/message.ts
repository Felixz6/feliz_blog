import { sendContactMessage } from '../../server/contact.ts';
import type { ContactEnvironment } from '../../server/contact.ts';
export const onRequest = ({ request, env }: { request: Request; env: ContactEnvironment }) => sendContactMessage(request, env);
