#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const args = parseArgs(process.argv.slice(2));
const root = path.resolve(args.root || 'src');
const maxResults = Number(args.max || 200);
const failOn = args['fail-on'] || '';
const jsonOutput = Boolean(args.json);

const allowTerms = [
  'AIOps Agent', 'AIOps', 'Agent', 'Hermes', 'MCP', 'API', 'SSH', 'VNC',
  'CPU', 'GPU', 'IP', 'URL', 'ID', 'SQL', 'LLM', 'AI', 'RCA',
  'Kubernetes', 'K8s', 'k8s', 'Git', 'DevOps', 'Runtime', 'Channel',
  'Skill', 'Tool', 'Trace', 'JSON', 'YAML', 'HTTP', 'HTTPS',
  'Nginx', 'Redis', 'PostgreSQL', 'Docker', 'Web', 'AP', 'CSV',
  'Prometheus', 'Zabbix', 'IIS', 'Windows', 'Webhook', 'CORS',
  'Prompt', 'I/O', 'MB/s', 'MB'
];

const ignoredDirs = new Set([
  'node_modules',
  'dist',
  'build',
  '.git'
]);

const ignoredPathParts = [
  `${path.sep}src${path.sep}i18n${path.sep}`,
  `${path.sep}src${path.sep}contexts${path.sep}LocaleContext.tsx`
];

const findings = [];

for (const file of walk(root)) {
  if (!/\.(tsx?|jsx?)$/.test(file)) continue;
  if (ignoredPathParts.some((part) => file.includes(part))) continue;
  const source = fs.readFileSync(file, 'utf8');
  const stripped = stripComments(source);
  const lineStarts = getLineStarts(stripped);
  scanStringLiterals(file, stripped, lineStarts);
  scanJsxText(file, stripped, lineStarts);
}

const sorted = findings.sort((a, b) => (
  severityRank(b.severity) - severityRank(a.severity) ||
  a.file.localeCompare(b.file) ||
  a.line - b.line
));

const result = {
  summary: summarize(sorted),
  findings: sorted.slice(0, maxResults),
  totalFindings: sorted.length,
  truncated: sorted.length > maxResults
};

if (jsonOutput) {
  console.log(JSON.stringify(result, null, 2));
} else {
  printHuman(result);
}

if (shouldFail(result.summary, failOn)) {
  process.exit(1);
}

function parseArgs(argv) {
  const parsed = {};
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;
    const [key, value] = arg.slice(2).split('=');
    parsed[key] = value === undefined ? true : value;
  }
  return parsed;
}

function* walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignoredDirs.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(fullPath);
    } else {
      yield fullPath;
    }
  }
}

function stripComments(source) {
  let out = '';
  let i = 0;
  let mode = 'code';
  let quote = '';

  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];

    if (mode === 'code') {
      if ((ch === '"' || ch === "'" || ch === '`')) {
        mode = 'string';
        quote = ch;
        out += ch;
        i += 1;
        continue;
      }
      if (ch === '/' && next === '/') {
        mode = 'lineComment';
        out += '  ';
        i += 2;
        continue;
      }
      if (ch === '/' && next === '*') {
        mode = 'blockComment';
        out += '  ';
        i += 2;
        continue;
      }
      out += ch;
      i += 1;
      continue;
    }

    if (mode === 'string') {
      out += ch;
      if (ch === '\\') {
        if (i + 1 < source.length) {
          out += source[i + 1];
          i += 2;
          continue;
        }
      }
      if (ch === quote) {
        mode = 'code';
        quote = '';
      }
      i += 1;
      continue;
    }

    if (mode === 'lineComment') {
      if (ch === '\n') {
        mode = 'code';
        out += '\n';
      } else {
        out += ' ';
      }
      i += 1;
      continue;
    }

    if (mode === 'blockComment') {
      if (ch === '*' && next === '/') {
        mode = 'code';
        out += '  ';
        i += 2;
      } else {
        out += ch === '\n' ? '\n' : ' ';
        i += 1;
      }
    }
  }

  return out;
}

function scanStringLiterals(file, source, lineStarts) {
  const regex = /(['"`])((?:\\.|(?!\1)[\s\S])*?)\1/g;
  let match;
  while ((match = regex.exec(source))) {
    const raw = match[2];
    const text = normalizeLiteral(raw);
    if (!shouldInspect(text)) continue;
    if (isLikelyNonUiString(text)) continue;
    addFindingsForText(file, lineStarts, match.index, text, 'string');
  }
}

function scanJsxText(file, source, lineStarts) {
  const regex = />\s*([^<>{}\n][^<>{}]*)\s*</g;
  let match;
  while ((match = regex.exec(source))) {
    const text = normalizeWhitespace(match[1]);
    if (!shouldInspect(text)) continue;
    addFindingsForText(file, lineStarts, match.index + 1, text, 'jsx-text');
  }
}

function addFindingsForText(file, lineStarts, index, text, sourceType) {
  const normalized = normalizeWhitespace(text);
  if (!normalized || normalized.length < 2) return;

  const deTermed = removeAllowedTerms(normalized);
  if (hasCjkAsciiGlue(deTermed)) {
    pushFinding(file, lineStarts, index, {
      type: 'mixed-cjk-ascii',
      severity: 'error',
      sourceType,
      text: normalized,
      message: '疑似中英无空格拼接或 DOM 后处理翻译残留'
    });
    return;
  }

  if (hasCjk(normalized) && sourceType === 'jsx-text') {
    pushFinding(file, lineStarts, index, {
      type: 'hardcoded-cjk-jsx',
      severity: 'warn',
      sourceType,
      text: normalized,
      message: 'JSX 中存在硬编码中文，建议迁移到 t()'
    });
    return;
  }

  if (hasCjk(normalized) && looksLikeUiString(normalized)) {
    pushFinding(file, lineStarts, index, {
      type: 'hardcoded-cjk-string',
      severity: 'warn',
      sourceType,
      text: normalized,
      message: '字符串中存在疑似 UI 中文文案，建议迁移到 t()'
    });
  }
}

function pushFinding(file, lineStarts, index, finding) {
  const loc = getLineColumn(lineStarts, index);
  findings.push({
    file: path.relative(process.cwd(), file),
    line: loc.line,
    column: loc.column,
    ...finding
  });
}

function normalizeLiteral(value) {
  return normalizeWhitespace(value
    .replace(/\\n/g, ' ')
    .replace(/\\t/g, ' ')
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"')
    .replace(/`/g, '')
  );
}

function normalizeWhitespace(value) {
  return String(value).replace(/\s+/g, ' ').trim();
}

function shouldInspect(text) {
  if (!text || text.length < 2) return false;
  if (!hasCjk(text) && !hasSuspiciousEnglishUiWord(text)) return false;
  return true;
}

function hasCjk(value) {
  return /[\u3400-\u9fff]/.test(value);
}

function hasSuspiciousEnglishUiWord(value) {
  return /\b(Add|View|Run|New|Edit|Delete|Enabled|Disabled|WorkflowTemplate|MediumTask)\b/.test(value);
}

function hasCjkAsciiGlue(value) {
  return /[\u3400-\u9fff][A-Za-z]{2,}|[A-Za-z]{2,}[\u3400-\u9fff]/.test(value);
}

function removeAllowedTerms(value) {
  let next = value;
  for (const term of [...allowTerms].sort((a, b) => b.length - a.length)) {
    next = next.replace(new RegExp(escapeRegExp(term), 'g'), ' ');
  }
  return next;
}

function looksLikeUiString(value) {
  if (value.length > 160) return false;
  if (/^[\w./:@-]+$/.test(value)) return false;
  return /[按钮新增编辑删除保存取消确认运行执行查看搜索加载暂无失败成功状态名称描述设置管理告警任务服务器工作流知识审批]/.test(value);
}

function isLikelyNonUiString(value) {
  if (/^https?:\/\//.test(value)) return true;
  if (/^\/api\//.test(value)) return true;
  if (/^[./\w-]+\.(ts|tsx|js|jsx|css|svg|png|jpg|json)$/.test(value)) return true;
  if (/^[a-zA-Z0-9_-]+$/.test(value) && value.length < 40) return true;
  if (/^(GET|POST|PUT|DELETE|PATCH)$/.test(value)) return true;
  return false;
}

function getLineStarts(source) {
  const starts = [0];
  for (let i = 0; i < source.length; i += 1) {
    if (source[i] === '\n') starts.push(i + 1);
  }
  return starts;
}

function getLineColumn(lineStarts, index) {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (lineStarts[mid] <= index) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  const lineIndex = Math.max(0, high);
  return {
    line: lineIndex + 1,
    column: index - lineStarts[lineIndex] + 1
  };
}

function summarize(items) {
  const summary = {
    total: items.length,
    error: 0,
    warn: 0,
    byType: {},
    byFile: {}
  };

  for (const item of items) {
    summary[item.severity] += 1;
    summary.byType[item.type] = (summary.byType[item.type] || 0) + 1;
    summary.byFile[item.file] = (summary.byFile[item.file] || 0) + 1;
  }

  return summary;
}

function printHuman(result) {
  const { summary, findings: visibleFindings, totalFindings, truncated } = result;
  console.log('i18n audit summary');
  console.log(`  total: ${summary.total}`);
  console.log(`  errors: ${summary.error}`);
  console.log(`  warnings: ${summary.warn}`);
  console.log('');

  const topFiles = Object.entries(summary.byFile)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);
  if (topFiles.length > 0) {
    console.log('top files');
    for (const [file, count] of topFiles) {
      console.log(`  ${count.toString().padStart(4, ' ')}  ${file}`);
    }
    console.log('');
  }

  for (const finding of visibleFindings) {
    console.log(`${finding.severity.toUpperCase()} ${finding.type} ${finding.file}:${finding.line}:${finding.column}`);
    console.log(`  ${finding.message}`);
    console.log(`  ${finding.text.slice(0, 180)}`);
  }

  if (truncated) {
    console.log('');
    console.log(`showing ${visibleFindings.length} of ${totalFindings} findings; use --max=N or --json for more`);
  }
}

function shouldFail(summary, level) {
  if (level === 'error') return summary.error > 0;
  if (level === 'warn') return summary.error > 0 || summary.warn > 0;
  return false;
}

function severityRank(severity) {
  return severity === 'error' ? 2 : 1;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
