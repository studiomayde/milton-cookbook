// Builds the Milton Manor daily digest email (email-safe HTML: tables + inline styles).
// data = { today:'YYYY-MM-DD', dates:[{d,name,note,due}], lists:[{name,groups:[{heading,items:[{name,note}]}]}], appUrl }
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SERIF = `'Cormorant Garamond', Garamond, 'Times New Roman', serif`;
const SANS = `Inter, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`;
const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) };
const longDate = s => { const d = parse(s); return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}` };
const shortDate = s => { const d = parse(s); return `${DAYS[d.getDay()].slice(0, 3)} ${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}` };

function panel(kick, title, link, body) {
  return `<tr><td style="padding:0 0 20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f7f7;border-radius:10px">
<tr><td style="padding:24px 24px 8px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td valign="bottom">${kick ? `<div style="font:500 10px/1.4 ${SANS};letter-spacing:.12em;text-transform:uppercase;color:#737373">${esc(kick)}</div>` : ''}
<div style="font:400 30px/1 ${SERIF};color:#111;margin-top:6px">${esc(title)}</div></td>
${link ? `<td valign="bottom" align="right" style="white-space:nowrap"><a href="${esc(link.href)}" style="font:500 12px/1 ${SANS};color:#111;text-decoration:underline">${esc(link.text)}</a></td>` : ''}
</tr></table></td></tr>
<tr><td style="padding:8px 24px 18px">${body}</td></tr></table></td></tr>`;
}
const row = (cells, bold) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e4e4e4"><tr>${cells(bold)}</tr></table>`;

export function renderDigest({ today, dates, lists, appUrl }) {
  const datesBody = dates.length ? dates.map(x => {
    const soon = x.soon, w = soon ? 600 : 400, c = soon ? '#111' : '#737373';
    return row(() => `<td width="92" style="padding:11px 0;font:${w} 10px/1.4 ${SANS};letter-spacing:.08em;text-transform:uppercase;color:${c}">${esc(shortDate(x.d))}</td>
<td style="padding:11px 8px;font:${w} 13px/1.4 ${SANS};color:#111">${esc(x.name)}${x.note ? ` <span style="color:#737373;font-weight:400">· ${esc(x.note)}</span>` : ''}</td>
<td align="right" style="padding:11px 0;font:${w} 12px/1.4 ${SANS};color:${c};white-space:nowrap">${esc(x.due)}</td>`);
  }).join('') : `<p style="margin:0;font:400 13px/1.5 ${SANS};color:#737373">Nothing in the next two weeks.</p>`;

  const listPanels = lists.map(L => {
    const n = L.groups.reduce((a, g) => a + g.items.length, 0);
    const body = L.groups.map(g => (g.heading ? `<div style="font:500 10px/1.4 ${SANS};letter-spacing:.12em;text-transform:uppercase;color:#737373;padding:14px 0 6px">${esc(g.heading)}</div>` : '') +
      g.items.map(i => row(() => `<td width="26" valign="top" style="padding:12px 0"><div style="width:14px;height:14px;border:1px solid #a6a6a6;border-radius:3px;background:#fff"></div></td>
<td style="padding:11px 0;font:400 13px/1.45 ${SANS};color:#111">${esc(i.name)}${i.note ? `<div style="font:400 12px/1.45 ${SANS};color:#737373;padding-top:2px">${esc(i.note)}</div>` : ''}</td>`)).join('')).join('');
    return panel(`${n} item${n === 1 ? '' : 's'}`, L.name, { href: appUrl, text: 'Open list' }, body);
  }).join('');

  const total = lists.reduce((a, L) => a + L.groups.reduce((b, g) => b + g.items.length, 0), 0);
  const preheader = `${dates.length} key date${dates.length === 1 ? '' : 's'} in the next two weeks · ${total} thing${total === 1 ? '' : 's'} to do`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<title>Milton Manor · ${esc(longDate(today))}</title></head>
<body style="margin:0;padding:0;background:#ffffff;-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px">
<tr><td style="padding:0 0 28px"><a href="${esc(appUrl)}" style="font:500 12px/1 ${SANS};letter-spacing:.18em;text-transform:uppercase;color:#111;text-decoration:none">Milton Manor</a></td></tr>
<tr><td style="padding:0 0 26px"><div style="font:500 10px/1.4 ${SANS};letter-spacing:.12em;text-transform:uppercase;color:#737373">${esc(longDate(today))}</div>
<div style="font:400 44px/1.05 ${SERIF};color:#111;margin-top:8px">Good morning</div></td></tr>
${panel('Next two weeks', 'Key dates', { href: appUrl, text: 'Open list' }, datesBody)}
${listPanels || panel('', 'Lists', null, `<p style="margin:0;font:400 13px/1.5 ${SANS};color:#737373">Nothing to do on any list.</p>`)}
<tr><td align="center" style="padding:12px 0 0;font:400 11px/1.6 ${SANS};color:#a6a6a6">Sent every morning at 7am from <a href="${esc(appUrl)}" style="color:#737373">Milton Manor</a></td></tr>
</table></td></tr></table></body></html>`;
}
