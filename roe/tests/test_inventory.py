import gzip
import tempfile
import unittest
from pathlib import Path

from roe.inventory import guess_kind, inspect_file, scan, to_markdown


class InventoryTests(unittest.TestCase):
    def test_csv_columns_rows_and_date_range(self):
        with tempfile.TemporaryDirectory() as t:
            p = Path(t) / "EURUSD_M1.csv"
            p.write_text("time,open,high,low,close\n2024-01-02 00:00,1,2,1,2\n2024-01-02 00:01,1,2,1,2\n2024-03-05 23:59,1,2,1,2\n")
            r = inspect_file(p)
            self.assertEqual(r["columns"][0], "time")
            self.assertEqual(r["rows"], 3)
            self.assertEqual((r["firstDate"], r["lastDate"]), ("2024-01-02 00:00", "2024-03-05 23:59"))
            self.assertEqual(r["kind"], "m1")
            self.assertFalse(r["over100mb"])

    def test_gz_csv_first_date_only(self):
        with tempfile.TemporaryDirectory() as t:
            p = Path(t) / "oi_chain.csv.gz"
            with gzip.open(p, "wt") as f:
                f.write("date,strike\n2025-05-05,1\n2025-05-06,2\n")
            r = inspect_file(p)
            self.assertEqual(r["firstDate"], "2025-05-05")
            self.assertEqual(r["kind"], "oi")

    def test_scan_groups_totals_flags_and_missing_folder(self):
        with tempfile.TemporaryDirectory() as t:
            d = Path(t) / "databento_es"; d.mkdir()
            (d / "a.dbn").write_bytes(b"x" * 10)
            inv = scan([str(d), str(Path(t) / "nope")])
            self.assertEqual(inv["totals"]["files"], 1)
            self.assertEqual(inv["groups"][0]["kinds"], ["databento"])
            self.assertTrue(inv["errors"])
            self.assertIn("databento_es", to_markdown(inv))

    def test_kind_guess(self):
        self.assertEqual(guess_kind("x/nq_futures_2024.csv"), "futures")
        self.assertEqual(guess_kind("misc/readme.txt"), "other")


if __name__ == "__main__":
    unittest.main()
