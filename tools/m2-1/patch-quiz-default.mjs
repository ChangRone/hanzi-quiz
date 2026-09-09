import fs from 'node:fs/promises';

const file = 'index.html';
let s = await fs.readFile(file, 'utf8');
const mustReplace = (from, to, label) => {
  if (!s.includes(from)) throw new Error(`M2-1 patch anchor missing: ${label}`);
  s = s.replace(from, to);
};

mustReplace(
`    const DEFAULT_CHAR_SOURCE_SETTINGS = {\n      mode: 'default',\n      customTemplate: 'char-data/{char}.json'\n    };`,
`    const APPROVED_CHAR_DATASET_VERSION = 'moe-6063-v1';\n    const APPROVED_CHAR_DATA_TEMPLATE = 'char-data/moe-6063-v1/{hex}.json';\n    const DEFAULT_CHAR_SOURCE_SETTINGS = {\n      mode: 'default',\n      customTemplate: 'char-data/{char}.json'\n    };`,
'dataset constants');

mustReplace(
`              <option value="default">預設 Hanzi Writer 字庫</option>\n              <option value="custom-first">自訂字庫優先，失敗回預設</option>\n            </select>\n            <div class="tuning-help">策略一：先保留預設資料源，同時支援自訂 Hanzi Writer 相容 JSON 覆寫。</div>`,
`              <option value="default">MOE 6063 核可字庫（預設）</option>\n              <option value="custom-first">自訂字庫優先 → MOE 6063 → Hanzi Writer fallback</option>\n            </select>\n            <div class="tuning-help">預設先讀已核可 Frozen Dataset；6063 以外或檔案缺失時才回退 Hanzi Writer 官方資料。</div>`,
'source selector');

mustReplace(
`            <input type="text" id="setting-char-template" value="char-data/{char}.json" />\n            <div class="tuning-help">支援 <code>{char}</code> 或 <code>{charEncoded}</code>。例如 <code>char-data/{char}.json</code>。</div>`,
`            <input type="text" id="setting-char-template" value="char-data/{char}.json" />\n            <div class="tuning-help">自訂來源支援 <code>{char}</code>、<code>{charEncoded}</code>、<code>{hex}</code>。預設核可字庫固定使用 <code>char-data/moe-6063-v1/{hex}.json</code>。</div>`,
'custom template help');

mustReplace(
`    function formatCharSourceModeLabel(mode) {\n      return mode === 'custom-first' ? '自訂優先' : '預設';\n    }`,
`    function formatCharSourceModeLabel(mode) {\n      return mode === 'custom-first' ? '自訂優先' : 'MOE 6063 核可字庫';\n    }`,
'source label');

mustReplace(
`    function resolveCharTemplate(template, char) {\n      return String(template || '')\n        .replaceAll('{charEncoded}', encodeURIComponent(char))\n        .replaceAll('{char}', char);\n    }`,
`    function resolveCharTemplate(template, char) {\n      const hex = [...String(char || '')][0]?.codePointAt(0)?.toString(16).toLowerCase() || '';\n      return String(template || '')\n        .replaceAll('{charEncoded}', encodeURIComponent(char))\n        .replaceAll('{char}', char)\n        .replaceAll('{hex}', hex);\n    }`,
'hex resolver');

mustReplace(
`    function buildCharDataLoader(charSourceSettings) {\n      const settings = normalizeCharSourceSettings(charSourceSettings);\n      if (settings.mode === 'default') return null;\n      return function(char, onComplete) {\n        loadCustomCharacterData(char, settings.customTemplate)\n          .then(onComplete)\n          .catch(() => loadDefaultCharacterData(char).then(onComplete));\n      };\n    }`,
`    function loadApprovedCharacterData(char) {\n      return loadCustomCharacterData(char, APPROVED_CHAR_DATA_TEMPLATE);\n    }\n\n    function buildCharDataLoader(charSourceSettings) {\n      const settings = normalizeCharSourceSettings(charSourceSettings);\n      return function(char, onComplete) {\n        const preferred = settings.mode === 'custom-first'\n          ? loadCustomCharacterData(char, settings.customTemplate).catch(() => loadApprovedCharacterData(char))\n          : loadApprovedCharacterData(char);\n        preferred\n          .catch(() => loadDefaultCharacterData(char))\n          .then(onComplete);\n      };\n    }`,
'default approved loader');

mustReplace(
`        <div class="tuning-note" id="tuning-note">策略一先提供字體資料來源切換與自訂路徑樣板；策略二則把 quiz 判定值集中到此處。調整後按「套用設定」，當前題目會重新開始。</div>`,
`        <div class="tuning-note" id="tuning-note">M2-1：正式字形預設使用 MOE 6063 核可 Frozen Dataset；自訂來源僅作顯式覆寫，缺字最後才使用 Hanzi Writer fallback。調整後按「套用設定」，當前題目會重新開始。</div>`,
'tuning note');

await fs.writeFile(file, s);
console.log('M2_1_PATCH=PASS');
console.log(`dataset=${'moe-6063-v1'}`);
