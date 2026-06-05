#!/usr/bin/env python3
"""
Downloads M1 parquet files from Cloudflare R2 into VolRangeForecaster/data/m1/.
Requires boto3: pip3 install boto3
Set R2_ACCESS_KEY and R2_SECRET_KEY as environment variables (or edit below).
"""
import boto3
import os
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed

R2_ENDPOINT = "https://3e867110ae519cd24afc877c72e5026e.r2.cloudflarestorage.com"
BUCKET      = "r2-storage"
R2_PREFIX   = "m1"
OUTDIR      = os.path.join(os.path.dirname(__file__), "../VolRangeForecaster/data/m1")

PAIRS = [
    "eurusd","gbpusd","usdjpy","audusd","nzdusd","usdcad","usdchf",
    "gbpjpy","eurjpy","eurgbp","euraud","eurcad","eurchf","eurnzd",
    "audjpy","audnzd","audcad","audchf","gbpaud","gbpcad","gbpchf",
    "gbpnzd","cadjpy","chfjpy","nzdjpy",
    "gold",
]


def main():
    access_key = os.environ.get("R2_ACCESS_KEY", "25f206aea31c52f4f432c46bd6d5a249")
    secret_key = os.environ.get("R2_SECRET_KEY")
    if not secret_key:
        # fallback — store the secret in env rather than source for production
        secret_key = "7a16548bb2b7060ff09dab76e683b8d5334eb1b002ffaf255b258fb6a7c7b0ab"

    os.makedirs(OUTDIR, exist_ok=True)
    s3 = boto3.client("s3",
        endpoint_url=R2_ENDPOINT,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        region_name="auto",
    )

    pairs = sys.argv[1:] if len(sys.argv) > 1 else PAIRS

    def download(pair):
        out = os.path.join(OUTDIR, f"{pair}_m1.parquet")
        if os.path.exists(out) and os.path.getsize(out) > 10_000:
            return pair, os.path.getsize(out) // 1024, True  # skipped
        key = f"{R2_PREFIX}/{pair}_m1.parquet"
        s3.download_file(BUCKET, key, out)
        return pair, os.path.getsize(out) // 1024, False

    failed = []
    with ThreadPoolExecutor(max_workers=6) as ex:
        futures = {ex.submit(download, p): p for p in pairs}
        done = 0
        for fut in as_completed(futures):
            done += 1
            pair = futures[fut]
            try:
                p, kb, skipped = fut.result()
                status = "skipped" if skipped else f"{kb} KB"
                print(f"[{done}/{len(pairs)}] {p} — {status}")
            except Exception as e:
                print(f"[{done}/{len(pairs)}] {pair} — FAILED: {e}")
                failed.append(pair)

    print(f"\n=== {len(pairs)-len(failed)}/{len(pairs)} ready ===")
    if failed:
        print("Failed:", failed)
        sys.exit(1)


if __name__ == "__main__":
    main()
