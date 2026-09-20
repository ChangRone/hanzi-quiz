# Hanzi Dictation Project

本文件以目前**最新完整專案包**的實際內容為基準整理；本次已把題庫索引調整為「`quiz-index.json` 一教材一筆 + `lessonPattern` / `lessonRange` + `packs/` 每課單檔」的 v1.5 最小變更方案。

## 專案定位

這是一個可直接部署到 GitHub Pages 的中文聽寫練習專案，主程式為單一 `index.html`，搭配外部 `quiz-index.json`、`packs/*.json`、`config/schema-config.json` 與 `schema/*.json`。

## 目前正式功能

- 遠端載入：讀取目前網站的 `quiz-index.json` 與 `packs/*.json`
- `quiz-index.json` 以**一教材一筆**維護，必要時可用 `lessonPattern` / `lessonRange` 展開多課檔
- 本機資料夾匯入：使用 `<input type="file" webkitdirectory>` 讀取本機 JSON
- 內建 fallback 題庫：遠端 / 本機失敗時可退回
- 本機匯入結果摘要：成功 pack id、失敗 pack 與原因、是否 fallback、schema-config 套用狀態
- 結構化篩選：年份、出版社、年級、學期、考試範圍
- 多 pack 勾選與合併出題
- HanziWriter 書寫、語音播放、重寫、下一題、自動下一題
- 作答頁可依實際已載入題目切換「全部課次 / 指定第幾課」
- 筆順提示只播放未完成格，提示結束後可繼續書寫
- 作答頁統計列上移，底部保留固定空白避免操作列遮擋
- 返回首頁按鈕置於書寫區內右上角的低干擾位置

## 目前正式目錄

```text
hanzi_project_lessonpattern_v17/
├─ index.html
├─ README.md
├─ quiz-index.json
├─ config/
│  └─ schema-config.json
├─ schema/
│  ├─ pack.schema.json
│  └─ quiz-index.schema.json
├─ packs/
│  ├─ 2026南一小二上-03.json
│  └─ 2025翰林小二下-04.json
└─ docs/
   ├─ 00-project-overview.md
   ├─ 01-system-architecture.md
   ├─ 02-pack-schema-v1.md
   ├─ 03-state-machine-v1.md
   ├─ 04-ui-views-and-interactions.md
   ├─ 05-ai-implementation-contract.md
   ├─ 06-coding-standards-and-environment.md
   ├─ 07-acceptance-checklist.md
   ├─ 08-implementation-spec-v1.md
   └─ 09-project-config-standard.md
```

## 目前資料策略

- `quiz-index.json` 每個教材只保留一筆
- `dataUrl` 仍保留為單一字串，用於舊相容入口或單檔 fallback
- `lessonPattern` 以 `{LL}` 代表兩位數課次，例如 `packs/2026南一小二上-{LL}.json`
- `lessonRange` 代表展開範圍，例如 `[1, 20]`
- 實際存在的 lesson 檔才會被合併進同一個 pack；不存在的課檔會自動略過

## 注意

- `pack.id` 仍維持 8 碼教材層級
- `question.id` 仍維持 12 碼，後四碼保留 `LLQQ`
- `config/schema-config.json` 這次**沒有改動結構**
- 本次在不動 schema / config 的前提下，補回作答頁課次切換與提示後可續寫的正式行為


## Catalog v2（正式選課索引）

- 正式選課改讀 `quiz-catalog-v2.json`，首頁只載入課次 metadata，不再先下載全部題目。
- 每個 `packs/*.json` **必須**有 `catalog.included: true|false`；不得省略。
- `catalog.included: true` 是是否進入正式 Catalog 的唯一來源；`false` 可保留草稿／尚未上線題庫。
- `quiz-catalog-v2.json` 由 `node tools/catalog/build-catalog-v2.mjs` 自動產生，不人工維護。
- `node tools/catalog/validate-catalog-v2.mjs` 會檢查漏欄位、重複 lesson key、題數／生字 metadata 與 Catalog 是否同步。
- Runtime 只在已選課需要估算／開始練習時 lazy-load 對應 pack，並以 `sourceHash` 形成版本化 URL 讓瀏覽器可安全快取。
- 舊 `quiz-index.json` 暫時保留為 fallback 相容入口，不再作為 v2 Catalog 的來源。


## 正式語音（Azure 預產 MP3）

正式作答語音採：

- Voice：`zh-TW-HsiaoChenNeural`
- Strategy：verified partial phoneme（只強制已經 A/B 實聽驗證的字音組合）
- Prosody rate：`-12%`
- Runtime：正式 Quiz 直接讀取 Lab 已驗證的 Azure MP3；**不再以瀏覽器 Web Speech 作 fallback**
- Audio failure：若 MP3 載入／播放失敗，保留作答功能並顯示可重試訊息，不偷偷換成不同語音來源
- Preload：只保留當題與鄰近題目的小型 LRU audio cache，避免大量題目長時間練習時持續佔用記憶體
- Asset source of truth：`ChangRone/hanzi-writing-lab/production-audio/v1/`
- Storage policy：正式 MP3 只在 Lab 保存一份；Quiz 不再複製相同 2070 檔，避免雙份同步與版本漂移
- Security：Azure Speech Key 僅存在 GitHub Actions Secret，不進瀏覽器程式、題庫或公開 JSON
- Cache：URL version 同時包含正式語音 profile version 與 pack `sourceHash` 前綴；題目內容更新時會自動換 URL

`PRODUCTION_AUDIO_VERSION` 只代表 voice / mode / rate 等正式語音 profile。若這些正式參數改變，需 bump 此版本；題庫文字或 token 更新則由 `sourceHash` 自動處理快取版本。
