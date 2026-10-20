import { sendResend } from '../../server/resend.ts';
export const onRequest = ({ request }: { request: Request }) => sendResend(request);
