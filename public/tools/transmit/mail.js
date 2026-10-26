function escapeHtml(s){return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
function buildMailPayload({from,to,cc,bcc,replyTo,subject,mode,body,atts}){
  const payload={from,to,subject};
  if(cc.length)payload.cc=cc;
  if(bcc.length)payload.bcc=bcc;
  if(replyTo)payload.reply_to=replyTo;
  // Resend rejects an omitted or empty body; these render blank for attachment-only sends.
  payload[mode]=body.trim()?body:(mode==='html'?'&nbsp;':'\u00a0');
  if(atts.length)payload.attachments=atts.map(a=>({filename:a.filename,content:a.content}));
  return payload;
}
