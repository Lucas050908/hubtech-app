/** Tiny, safe syntax highlighter (escapes first) – used by Kodestumper and Kodeskolen. */
const KEYWORDS = {
  python: 'def|class|return|if|elif|else|for|while|in|import|from|as|with|try|except|finally|raise|lambda|None|True|False|and|or|not|pass|break|continue|yield|async|await',
  javascript: 'const|let|var|function|return|if|else|for|while|of|in|new|class|extends|import|from|export|default|async|await|try|catch|finally|throw|null|undefined|true|false|this|typeof',
  bash: 'if|then|else|elif|fi|for|while|do|done|case|esac|function|in|echo|export|sudo|cd|ls|cat|grep|apt|systemctl|docker|git',
  powershell: 'function|param|if|else|elseif|foreach|for|while|return|try|catch|Get-\\w+|Set-\\w+|New-\\w+|Remove-\\w+|Write-Host',
  sql: 'SELECT|FROM|WHERE|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|JOIN|LEFT|RIGHT|INNER|ON|GROUP|BY|ORDER|LIMIT|AND|OR|NOT|NULL|AS|PRIMARY|KEY|COUNT|SUM|AVG|MIN|MAX|DISTINCT|HAVING|DESC|ASC|LIKE|IN|IS|BETWEEN|INTEGER|TEXT|REAL',
  cpp: 'int|void|char|float|double|bool|long|unsigned|const|return|if|else|for|while|include|define|struct|class|public|private|true|false|setup|loop|pinMode|digitalWrite|digitalRead|analogRead|delay|Serial',
  docker: 'FROM|RUN|COPY|ADD|CMD|ENTRYPOINT|ENV|EXPOSE|WORKDIR|VOLUME|ARG|USER|services|image|ports|volumes|environment',
};
export const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
/** Tiny, safe highlighter: escapes first, then wraps comments, strings, numbers and keywords. */
export function highlight(code, lang) {
  if (lang === 'html') return highlightHtml(code);
  const kw = KEYWORDS[lang];
  const hashComment = ['python', 'bash', 'powershell', 'yaml', 'docker'].includes(lang);
  const parts = [];
  const re = new RegExp([
    hashComment ? '(#[^\\n]*)' : lang === 'css' ? '(/\\*[\\s\\S]*?\\*/)' : lang === 'sql' ? '(--[^\\n]*|/\\*[\\s\\S]*?\\*/)' : '(//[^\\n]*|/\\*[\\s\\S]*?\\*/)',
    '("(?:\\\\.|[^"\\\\\\n])*"|\'(?:\\\\.|[^\'\\\\\\n])*\'|`(?:\\\\.|[^`\\\\])*`)',
    '(\\b\\d+(?:\\.\\d+)?\\b)',
    kw ? `(\\b(?:${kw})\\b)` : '($^)',
  ].join('|'), lang === 'sql' ? 'gi' : 'g');
  let last = 0, m;
  while ((m = re.exec(code))) {
    if (m.index === re.lastIndex) { re.lastIndex++; continue; }
    parts.push(esc(code.slice(last, m.index)));
    const cls = m[1] ? 'c' : m[2] ? 's' : m[3] ? 'n' : 'k';
    parts.push(`<span class="hl-${cls}">${esc(m[0])}</span>`);
    last = re.lastIndex;
  }
  parts.push(esc(code.slice(last)));
  return parts.join('');
}


function highlightHtml(code) {
  const out = [];
  const re = /<!--[\s\S]*?-->|<\/?[a-zA-Z][^>]*>?/g;
  let last = 0, m;
  while ((m = re.exec(code))) {
    out.push(esc(code.slice(last, m.index)));
    const t = m[0];
    if (t.startsWith('<!--')) out.push(`<span class="hl-c">${esc(t)}</span>`);
    else {
      const tm = /^(<\/?)([a-zA-Z][\w-]*)([\s\S]*?)(\/?>)?$/.exec(t);
      const attrs = (tm[3] || '').replace(/([^=\s]+)(=)("[^"]*"|'[^']*'|[^\s"'>]+)|([^\s]+)/g, (all, n, eq, v, lone) => lone !== undefined ? `\u0001${lone}\u0002` : `\u0003${n}\u0004${v}\u0005`);
      const attrHtml = esc(attrs).replace(/\u0003(.*?)\u0004(.*?)\u0005/g, '<span class="hl-n">$1</span>=<span class="hl-s">$2</span>').replace(/\u0001(.*?)\u0002/g, '<span class="hl-n">$1</span>');
      out.push(`${esc(tm[1])}<span class="hl-k">${esc(tm[2])}</span>${attrHtml}${esc(tm[4] || '')}`);
    }
    last = re.lastIndex;
  }
  out.push(esc(code.slice(last)));
  return out.join('');
}
