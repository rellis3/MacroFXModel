"""Print the structure of a banked line-touch response file (audit helper)."""
import json, sys
j = json.load(open(sys.argv[1]))
print({k: v for k, v in j.items() if k != 'days'})
d = j['days'][0]
print({k: v for k, v in d.items() if k != 'touches'})
print(d['touches'][0])
print('days', len(j['days']), 'touches', sum(len(x['touches']) for x in j['days']))
