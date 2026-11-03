"""Build a reading list of open-access papers on the topics the desk works on, and download the free PDFs.

Searches arXiv (q-fin, econ) per topic, in relevance order,
downloads each through fetch_papers.save_pdf (PDF header checked), and writes READING_LIST.md + reading_list.csv.

  python -I scripts/find_papers.py --out education/papers/open [--per-topic 12] [--no-download]
Re-running skips papers already saved.
"""
import argparse, csv, importlib.util, os, re, sys, urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('fetch_papers', os.path.join(HERE, 'fetch_papers.py'))
fp = importlib.util.module_from_spec(spec); spec.loader.exec_module(fp)

TOPICS = {
    'Volatility forecasting': ['range-based volatility estimator', 'realized volatility forecasting HAR model', 'implied volatility forecast content realized volatility',
                               'volatility forecasting evaluation loss functions', 'intraday volatility seasonality'],
    'Options positioning and dealer flow': ['dealer gamma hedging stock market volatility', 'option open interest and underlying price dynamics',
                                            'option market makers hedging impact on returns', '0DTE options market impact'],
    'Variance and tail risk premia': ['variance risk premium predictability', 'VIX term structure futures roll returns', 'volatility risk premium currency'],
    'FX: carry, momentum, value': ['currency momentum carry returns', 'foreign exchange predictability macro fundamentals', 'currency trading strategies out of sample',
                                   'covered interest parity deviations', 'exchange rate forecasting random walk'],
    'Macro announcements and events': ['macroeconomic announcements asset prices', 'pre-FOMC announcement drift', 'central bank communication financial markets',
                                       'economic surprises exchange rates intraday', 'monetary policy surprises high frequency identification'],
    'Rates, curve and cross-asset': ['yield curve predicts recession equity returns', 'bond yields and stock returns correlation regime', 'term premium and risk assets',
                                     'cross-asset momentum time series', 'stock bond correlation'],
    'Momentum, trend and mean reversion': ['time series momentum', 'intraday momentum predictability', 'trend following managed futures', 'overnight returns intraday returns anomaly',
                                           'short term reversal liquidity'],
    'Microstructure and order flow': ['order flow imbalance price impact', 'limit order book predictability', 'high frequency trading liquidity', 'opening auction price discovery'],
    'Backtesting and overfitting': ['backtest overfitting probability', 'deflated Sharpe ratio multiple testing', 'p-hacking finance replication', 'data snooping technical trading rules',
                                    'out-of-sample performance anomalies decay'],
    'Technical analysis and levels': ['technical analysis support resistance profitability', 'Fibonacci retracement price reversal evidence', 'round numbers price clustering'],
    'Machine learning for markets': ['machine learning asset pricing', 'deep learning return prediction', 'reinforcement learning trading', 'regime switching hidden Markov model asset allocation'],
    'Sentiment and positioning': ['commitments of traders positioning returns', 'investor sentiment predicts returns', 'retail trader losses contracts for difference'],
}


def search(q, n):
    """arXiv q-fin papers (all open) for a phrase, best match first. arXiv asks for ~3 s between calls."""
    import time, xml.etree.ElementTree as ET
    ns = {'a': 'http://www.w3.org/2005/Atom'}
    terms = '+AND+'.join('all:' + urllib.parse.quote(t) for t in q.split())
    url = 'http://export.arxiv.org/api/query?search_query=(%s)+AND+(cat:q-fin.*+OR+cat:econ.*+OR+cat:stat.AP)&max_results=%d&sortBy=relevance' % (terms, n)
    try:
        with fp.get(url, timeout=60) as r: root = ET.fromstring(r.read())
    except Exception:
        return []
    finally:
        time.sleep(3)
    out = []
    for e in root.findall('a:entry', ns):
        aid = e.find('a:id', ns).text.strip()
        out.append({'id': aid, 'title': e.find('a:title', ns).text, 'publication_year': int(e.find('a:published', ns).text[:4]),
                    'authorships': [{'author': {'display_name': x.find('a:name', ns).text}} for x in e.findall('a:author', ns)],
                    'doi': aid, 'cited_by_count': 0, 'pdf': aid.replace('/abs/', '/pdf/')})
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--out', required=True)
    ap.add_argument('--per-topic', type=int, default=12)
    ap.add_argument('--no-download', action='store_true')
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    seen, rows = set(), []
    for topic, queries in TOPICS.items():
        pool = {}
        for q in queries:
            for w in search(q, 6):
                if w['id'] in seen or w['id'] in pool: continue
                pool[w['id']] = (w, [w['pdf']])
        best = list(pool.values())[:a.per_topic]
        print('%-40s %d candidates -> %d kept' % (topic, len(pool), len(best)))
        for w, urls in best:
            seen.add(w['id'])
            title = re.sub(r'\s+', ' ', w.get('title') or '').strip()
            auth = '; '.join((x.get('author', {}).get('display_name') or '') for x in w.get('authorships', [])[:4])
            fname = '%s_%s.pdf' % (w['id'].rsplit('/', 1)[-1], fp.slug(title))
            path = os.path.join(a.out, fname)
            status, src = 'not downloaded', urls[0]
            if os.path.exists(path): status = 'downloaded'
            elif not a.no_download:
                for u in urls[:4]:
                    if fp.save_pdf(u, path): status, src = 'downloaded', u; break
                else: status = 'link only'
            rows.append({'topic': topic, 'title': title, 'authors': auth, 'year': w.get('publication_year') or '', 'cited_by': w.get('cited_by_count') or 0,
                         'status': status, 'file': fname if status == 'downloaded' else '', 'link': src, 'doi': w.get('doi') or ''})
            print('   %-14s %s' % (status, title[:70]))
    cols = ['topic', 'title', 'authors', 'year', 'cited_by', 'status', 'file', 'link', 'doi']
    with open(os.path.join(a.out, 'reading_list.csv'), 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=cols); w.writeheader(); w.writerows(rows)
    with open(os.path.join(a.out, 'READING_LIST.md'), 'w', encoding='utf-8') as f:
        f.write('# Open-access reading list\n\nEvery paper has a free copy outside SSRN. Best match first within each topic (arXiv has no citation counts).\n')
        for topic in TOPICS:
            f.write('\n## %s\n\n' % topic)
            for r in [r for r in rows if r['topic'] == topic]:
                f.write('- **%s** (%s, %s) · %s · [%s](%s)\n' % (r['title'], r['authors'].split(';')[0], r['year'], r['status'],
                        r['file'] or 'link', r['file'] or r['link']))
    got = sum(r['status'] == 'downloaded' for r in rows)
    print('\n%d papers, %d downloaded -> %s' % (len(rows), got, os.path.join(a.out, 'READING_LIST.md')))


if __name__ == '__main__':
    main()
