#!/usr/bin/env python3
"""
Downloads M1 parquet files from Google Drive via the Anthropic MCP proxy.
Uses the session token to authenticate directly against the MCP endpoint.
"""
import base64
import json
import os
import sys
import time
import requests

SESSION_UUID = "cse_01NeCoCsM7KUJzXMf76BjNPJ"
MCP_SERVER_ID = "336fd5c0-186d-442b-aaf4-47f077cc86de"
TOKEN_FILE = "/home/claude/.claude/remote/.session_ingress_token"
MCP_URL = (
    f"https://api.anthropic.com/v2/ccr-sessions/{SESSION_UUID}/mcp"
    "?mcp_url=https%3A%2F%2Fdrivemcp.googleapis.com%2Fmcp%2Fv1"
    f"&mcp_server_id=3c1d54f1-7613-5fad-9d4e-b3737b5dfcf8"
    f"&toolbox_mcp_server_id={MCP_SERVER_ID}"
)

OUTDIR = os.path.join(os.path.dirname(__file__), "../VolRangeForecaster/data/m1")

M1_DRIVE_IDS = {
    "eurusd": "1ifk4hr5qOtDoREn8GqwmoO-L1r_cTYug",
    "gbpusd": "1JbfcM6rM8gAOHYA1AAmucA4qyEcSpQO7",
    "usdjpy": "1WYPHM9jOFOFIBd_688LQPB_I6L1cmB_4",
    "audusd": "1dfemdaD1yfaTQUemzJWWt1kpzLyumebw",
    "nzdusd": "1XDqS3sJN-89k-C63UQe4MAsWfAu3yZLb",
    "usdcad": "1OzxAFB-H0ftdpZnGii_iGQsewqxTUHgh",
    "usdchf": "1R8-llmn8gFdYnNEeDlLkOWu9q-TRD6dr",
    "gbpjpy": "1lyb0suhTDc8-_KYEOUz0Nxyxz2fE-o-3",
    "eurjpy": "1W1VbRu4SNM8rheMWODC0lpngOv34FFCt",
    "eurgbp": "1JjIUUgL9_9v_fX7fKGi7Es4Ze8Ap1aol",
    "euraud": "1NvQvPWMCX3iTgsGvjFJUwYdHbQa29zKy",
    "eurcad": "1O4gfO-hoVlHk7ykFlrOizsz5-KVSkTUW",
    "eurchf": "1os4a5a_zjYRlNbkysuMpKar-uu_6ZyXZ",
    "eurnzd": "1DuNP1RxaMfO_3wZt1j75qaTnMpgg4Tiv",
    "audjpy": "13f6Eq9WFTJ_p3ByY74He8ATOzj5Ikrgx",
    "audnzd": "1UFoJPw1NsiTKQJFFTzkD18HqNjKLjNq7",
    "audcad": "1OvE2p1tTGci4bEDqtjwJDz3NXG4XtXe1",
    "audchf": "1uvO4eMVMhKV0KfeFHX_TC0FDyFql_hx8",
    "gbpaud": "13DFKMNuUEHRJTiB9mzr_MyhgZbBrt2ZY",
    "gbpcad": "1-_u_Gj5HVadZy69pdt5Sx6xTBiY0Cd2S",
    "gbpchf": "1iqcUOaEGQauM3QYpFPYVASpbe_pCtvH6",
    "gbpnzd": "17oqQKqwj2Kg7ShGXkQWDkvsu295UN5s2",
    "cadjpy": "1P76U9kNYP51vmcIpq7aL-IEyjRdtc0OT",
    "chfjpy": "10PBymXfhO4PdaxxZahreX5gdqOYQISCG",
    "nzdjpy": "13DjEKFjT9vOwg7eBf6JTNz5G_CTM8zUG",
}


def get_token():
    with open(TOKEN_FILE) as f:
        return f.read().strip()


def download_file(session: requests.Session, token: str, file_id: str, out_path: str) -> bool:
    headers = {
        "Authorization": f"Bearer {token}",
        "X-MCP-Server-ID": MCP_SERVER_ID,
        "X-Session-UUID": SESSION_UUID,
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
    }
    payload = {
        "jsonrpc": "2.0",
        "method": "tools/call",
        "params": {
            "name": "download_file_content",
            "arguments": {"fileId": file_id},
        },
        "id": 1,
    }

    resp = session.post(MCP_URL, headers=headers, json=payload, timeout=300, stream=True)
    resp.raise_for_status()

    # Collect full response (may be SSE stream or plain JSON)
    raw = b""
    for chunk in resp.iter_content(chunk_size=65536):
        raw += chunk

    text = raw.decode("utf-8", errors="replace")

    # Handle SSE: extract data lines
    if text.startswith("data:") or "\ndata:" in text:
        parts = []
        for line in text.splitlines():
            if line.startswith("data:"):
                parts.append(line[5:].strip())
        text = "".join(parts)

    data = json.loads(text)

    # Navigate JSON-RPC result → content[0].text → inner JSON → "content" field
    result = data.get("result", data)
    content_items = result.get("content", [])
    b64 = None
    for item in content_items:
        item_text = item.get("text", "")
        if not item_text:
            continue
        # The text field is itself a JSON string containing {"content": "<base64>", ...}
        try:
            inner = json.loads(item_text)
            b64 = inner.get("content")
            if b64:
                break
        except json.JSONDecodeError:
            # Fallback: treat the text itself as raw base64
            b64 = item_text
            break

    if not b64:
        print(f"  ERROR: no content in response for {file_id}")
        print(f"  Response keys: {list(result.keys())}")
        return False

    # Fix base64 padding if needed
    b64 = b64.strip()
    padding = len(b64) % 4
    if padding:
        b64 += "=" * (4 - padding)

    decoded = base64.b64decode(b64)
    with open(out_path, "wb") as f:
        f.write(decoded)
    return True


def main():
    os.makedirs(OUTDIR, exist_ok=True)
    token = get_token()
    session = requests.Session()

    pairs = list(M1_DRIVE_IDS.items())
    if len(sys.argv) > 1:
        pairs = [(p, i) for p, i in pairs if p in sys.argv[1:]]

    failed = []
    for idx, (pair, file_id) in enumerate(pairs, 1):
        out_path = os.path.join(OUTDIR, f"{pair}_m1.parquet")
        if os.path.exists(out_path) and os.path.getsize(out_path) > 10000:
            print(f"[{idx}/{len(pairs)}] {pair} — already present, skipping")
            continue

        print(f"[{idx}/{len(pairs)}] Downloading {pair}_m1.parquet ...", flush=True)
        try:
            ok = download_file(session, token, file_id, out_path)
            if ok:
                size_kb = os.path.getsize(out_path) // 1024
                print(f"  -> OK ({size_kb} KB)")
            else:
                failed.append(pair)
                if os.path.exists(out_path):
                    os.remove(out_path)
        except Exception as e:
            print(f"  -> FAILED: {e}")
            failed.append(pair)
            if os.path.exists(out_path):
                os.remove(out_path)
        time.sleep(0.5)

    print(f"\n=== {len(pairs) - len(failed)}/{len(pairs)} downloaded ===")
    if failed:
        print(f"Failed: {failed}")
        sys.exit(1)


if __name__ == "__main__":
    main()
