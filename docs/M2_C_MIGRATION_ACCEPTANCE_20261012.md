# C — Review Event v2 無損升版驗收（2026-10-12）

## 已通過的自動化檢驗

- 真實 Chromium 中建立 v1 IndexedDB，升版後確認 v2。
- 既有 event 的 id、char、skill、reviewedAt、result、mode 逐項保留；原有 skill_state 不被清除。
- v1 JSON 備份重複匯入後不產生重複 ID；v2 匯出仍含全部事件。
- 僅 `exposed` 的字不建立 mastery state；`tested` 才參與複習階段。
- 遇到沒有合法 pass/fail 的舊 v1 事件，原子升版中止，原始 v1 資料維持不變。
- Reload 後紀錄穩定；PR #5 的 CI PASS。

## 正式環境尚需驗證（不可省略）

1. 使用者在**目前正式網站／相同瀏覽器設定檔**的「資料與同步」按「匯出備份」，保存未修改的 v1 JSON，先記下事件總數。**不要刪除網站資料、不要清除 IndexedDB。**
2. 在隔離的測試網址與測試瀏覽器設定檔，匯入上述備份，確認事件總數、ID 唯一性、各字熟練度及到期日；不要直接在正式 origin 改用功能分支檔案。
3. 測試新增 `exposed` 和 `tested`，再重開網站及匯出 v2 JSON，應無遺失、無重複；測試 v1 → v2 → 重複匯入。
4. 若實際使用 Google Drive 同步，再用隔離的測試端驗證 v1 備份相容及回復；不可用測試資料覆寫正式 Google Drive appDataFolder。
5. 所有結果需留在 PR QA 記錄；只完成 CI 不可宣稱使用者資料已正式驗收通過。

## Gate

PR #5 維持 Draft；**不得自行合併或部署**。Event v2 正式切換前先取得實際使用者備份與人工驗收紀錄。

## 使用者備份檢查（2026-10-13）

- 使用者以離線 JSON 檢查工具回報：`PASS（依本工具可檢查範圍）`。
- 正式網站匯出的 v1 備份：`version=1`、`events=0`、`uniqueIds=0`、`legacyEvents=0`、`errors=0`。
- 此結果確認**備份格式可讀且其中沒有歷史 Review Events**，不是對有歷史事件的真實使用者帳號的遷移驗收；後者由 CI 的 v1 非空合成紀錄與回滾測試覆蓋。
- 備份 JSON 不含獨立 `skill_state` object store；不可由上述 0 筆事件直接推斷 IndexedDB 的 `skill_state` 必為空。升版程式不清除現存 `skill_state`，自動測試會檢查升版前後保持一致。
- 仍未取得正式 Google Drive 的人工同步驗收證據，因此此關卡不可標成全部正式上線完成。
