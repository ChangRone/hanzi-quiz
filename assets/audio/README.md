# 正式 Azure 語音資產

正式 Quiz **自己保存一份完整 MP3**，不依賴瀏覽器跨 repo 播放 Lab Pages。

目標路徑：

```text
assets/audio/v1/
├── manifest.json
└── audio/
    ├── <questionId>.mp3
    └── ...
```

來源：

- Generator / audit repo：`ChangRone/hanzi-writing-lab`
- Upstream：`production-audio/v1/`
- Sync script：`tools/audio/sync_from_lab.py`
- 正式播放：`assets/audio/v1/audio/<questionId>.mp3`

規則：

1. Lab 必須先完整生成、驗證並 commit MP3。
2. Quiz sync 必須使用解析後的 **Lab commit SHA**，不能用浮動 `main` 作正式來源。
3. Sync 會將 Quiz Catalog 全部正式 question ID 與 Lab manifest 做集合一致性比對。
4. 每個 MP3 下載後計算 SHA-256，寫入 Quiz local manifest。
5. 只有 100% 題目都有 MP3 才可替換 `assets/audio/v1`。
6. 正式 runtime 不再以 Web Speech 自動掩蓋 MP3 缺失；缺檔應被視為可觀察的部署問題。

重新同步：

```bash
python3 tools/audio/sync_from_lab.py
```

鎖定特定 Lab commit：

```bash
python3 tools/audio/sync_from_lab.py --lab-ref <40-char-sha>
```

正式 CI 會執行相同腳本並將同步後的二進位 MP3 commit 到 Quiz repo。
