#!/usr/bin/env python3
"""Synchronize validated production Azure MP3 assets from hanzi-writing-lab.

This script is intentionally owned by hanzi-quiz so the production application
stores its own copy of every audio asset. Lab remains the generator and audit
source; Quiz remains self-contained at runtime.
"""
from __future__ import annotations

import argparse
import concurrent.futures
import hashlib
import json
import os
import shutil
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LAB_REPO = "ChangRone/hanzi-writing-lab"
LAB_RAW = "https://raw.githubusercontent.com"
DEST = ROOT / "assets" / "audio" / "v1"
USER_AGENT = "hanzi-quiz-audio-sync/1.0"


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def resolve_lab_ref(value: str | None) -> str:
    if value:
        return value.strip()
    output = subprocess.check_output(
        ["git", "ls-remote", f"https://github.com/{LAB_REPO}.git", "refs/heads/main"],
        text=True,
        timeout=30,
    ).strip()
    sha = output.split()[0] if output else ""
    if len(sha) != 40:
        raise RuntimeError("Unable to resolve Lab main commit")
    return sha


def download(url: str, *, retries: int = 5, timeout: int = 45) -> bytes:
    last: Exception | None = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=timeout) as response:
                return response.read()
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as exc:
            last = exc
            if isinstance(exc, urllib.error.HTTPError) and exc.code == 404:
                raise RuntimeError(f"Missing upstream asset: {url}") from exc
            if attempt == retries - 1:
                break
            time.sleep(min(2 ** attempt, 8))
    raise RuntimeError(f"Failed to download {url}: {last}")


def catalog_question_ids() -> dict[str, str]:
    catalog = read_json(ROOT / "quiz-catalog-v2.json")
    ids: dict[str, str] = {}
    for lesson in catalog.get("lessons", []):
        rel = str(lesson["dataUrl"])
        pack = read_json(ROOT / rel)
        lesson_code = str(lesson["lessonCode"]).zfill(2)
        for q in pack.get("questions", []):
            qid = str(q.get("id", ""))
            if len(qid) != 12 or not qid.isdigit():
                continue
            if qid[8:10] != lesson_code:
                continue
            if qid in ids and ids[qid] != rel:
                raise RuntimeError(f"Duplicate question id {qid}")
            ids[qid] = rel
    return ids


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sync_from_local_lab(lab_dir: Path, lab_ref: str) -> None:
    source_root = lab_dir / "production-audio" / "v1"
    manifest_path = source_root / "manifest.json"
    if not manifest_path.exists():
        raise RuntimeError(f"Lab production manifest missing: {manifest_path}")
    manifest = read_json(manifest_path)
    if manifest.get("schema") != "hanzi-quiz-production-audio-v1":
        raise RuntimeError("Unsupported Lab production audio manifest")
    if manifest.get("voice") != "zh-TW-HsiaoChenNeural":
        raise RuntimeError("Unexpected production voice")
    if manifest.get("mode") != "verified-partial":
        raise RuntimeError("Unexpected production mode")
    if manifest.get("rate") != "-12%":
        raise RuntimeError("Unexpected production rate")

    expected = catalog_question_ids()
    upstream = {str(k): v for k, v in (manifest.get("questions") or {}).items()}
    missing = sorted(set(expected) - set(upstream))
    extra = sorted(set(upstream) - set(expected))
    if missing or extra:
        raise RuntimeError(f"Quiz/Lab question mismatch: missing={missing[:10]} extra={extra[:10]}")
    if len(expected) != int(manifest.get("questionCount", -1)):
        raise RuntimeError("Manifest questionCount does not match Quiz Catalog")

    tmp_parent = DEST.parent
    tmp_parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="audio-sync-", dir=tmp_parent) as td:
        tmp = Path(td)
        audio_dir = tmp / "audio"
        audio_dir.mkdir()

        def copy_one(qid: str) -> tuple[str, str, int]:
            item = upstream[qid]
            if not item.get("ready"):
                raise RuntimeError(f"Upstream audio not ready: {qid}")
            src = source_root / "audio" / f"{qid}.mp3"
            if not src.exists():
                raise RuntimeError(f"Lab MP3 missing: {src}")
            data = src.read_bytes()
            if len(data) < 500:
                raise RuntimeError(f"Suspiciously small MP3: {qid} ({len(data)} bytes)")
            (audio_dir / f"{qid}.mp3").write_bytes(data)
            return qid, sha256(data), len(data)

        hashes: dict[str, dict[str, object]] = {}
        with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, os.cpu_count() or 4)) as pool:
            futures = {pool.submit(copy_one, qid): qid for qid in sorted(expected)}
            for index, future in enumerate(concurrent.futures.as_completed(futures), 1):
                qid, digest, size = future.result()
                hashes[qid] = {"sha256": digest, "bytes": size}
                if index % 100 == 0 or index == len(expected):
                    print(f"copied {index}/{len(expected)}")

        local_manifest = {
            "schema": "hanzi-quiz-local-audio-v1",
            "sourceLabRepo": LAB_REPO,
            "sourceLabCommit": lab_ref,
            "voice": manifest["voice"],
            "mode": manifest["mode"],
            "rate": manifest["rate"],
            "questionCount": len(expected),
            "upstreamManifest": manifest,
            "files": {qid: hashes[qid] for qid in sorted(hashes)},
        }
        (tmp / "manifest.json").write_text(
            json.dumps(local_manifest, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

        # Validate the completed temporary tree before replacing production assets.
        actual = sorted(p.stem for p in audio_dir.glob("*.mp3"))
        if actual != sorted(expected):
            raise RuntimeError("Downloaded MP3 set does not exactly match Quiz questions")

        replacement = tmp_parent / "v1.next"
        if replacement.exists():
            shutil.rmtree(replacement)
        shutil.copytree(tmp, replacement)
        if DEST.exists():
            shutil.rmtree(DEST)
        replacement.rename(DEST)

    print(
        json.dumps(
            {
                "status": "ok",
                "sourceLabCommit": lab_ref,
                "questions": len(expected),
                "voice": manifest["voice"],
                "mode": manifest["mode"],
                "rate": manifest["rate"],
            },
            ensure_ascii=False,
        )
    )


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--lab-dir", type=Path, default=Path(os.environ.get("LAB_AUDIO_DIR", ".cache/hanzi-writing-lab")))
    p.add_argument("--lab-ref", default=os.environ.get("LAB_AUDIO_REF", ""))
    return p.parse_args()


if __name__ == "__main__":
    args = parse_args()
    lab_dir = args.lab_dir.resolve()
    if not lab_dir.exists():
        raise RuntimeError(f"Lab checkout not found: {lab_dir}")
    actual_ref = args.lab_ref.strip() or subprocess.check_output(
        ["git", "-C", str(lab_dir), "rev-parse", "HEAD"], text=True, timeout=15
    ).strip()
    if len(actual_ref) != 40:
        raise RuntimeError(f"Invalid Lab commit: {actual_ref}")
    sync_from_local_lab(lab_dir, actual_ref)
