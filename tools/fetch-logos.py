# 下载模型厂商 logo 到 web/assets/logos/，并生成 web/js/logos.js 映射表。
import json, os, sys, urllib.request, concurrent.futures, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SEED = os.path.join(ROOT, 'web', 'seed', 'aa.json')
OUT = os.path.join(ROOT, 'web', 'assets', 'logos')
os.makedirs(OUT, exist_ok=True)

seed = json.load(open(SEED, encoding='utf-8'))
models = seed['data']['models']
seen = {}
for m in models:
    c = m.get('creatorName')
    if c and c not in seen:
        seen[c] = {'slug': m.get('creatorSlug'), 'logo': m.get('creatorLogoUrl'), 'color': m.get('creatorColor')}

UA = {'User-Agent': 'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 Chrome/91 Mobile Safari/537.36'}

def grab(item):
    name, v = item
    url = v['logo']
    if not url:
        return (name, None, 0)
    ext = os.path.splitext(url.split('?')[0])[1].lower() or '.png'
    if ext not in ('.svg', '.png', '.jpg', '.webp', '.jpeg'):
        ext = '.png'
    fn = re.sub(r'[^a-z0-9_-]+', '-', (v['slug'] or name).lower()) + ext
    path = os.path.join(OUT, fn)
    if os.path.exists(path) and os.path.getsize(path) > 60:
        return (name, fn, os.path.getsize(path))
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=25) as r:
                data = r.read()
            if len(data) < 60:
                continue
            open(path, 'wb').write(data)
            return (name, fn, len(data))
        except Exception as e:
            err = str(e)
    return (name, None, 0)

with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:
    res = list(ex.map(grab, seen.items()))

ok = {n: f for n, f, s in res if f}
bad = [n for n, f, s in res if not f]
print('downloaded', len(ok), 'failed', len(bad))
if bad:
    print('failed list:', ', '.join(bad))

lines = ['/* logos.js — 厂商 logo 文件名与品牌色，由 tools/fetch-logos.py 生成 */',
         '(function (w) {',
         '  w.LOGOS = ' + json.dumps(ok, ensure_ascii=False, sort_keys=True) + ';',
         '  w.LOGO_COLORS = ' + json.dumps({n: (v['color'] or '') for n, v in seen.items()}, ensure_ascii=False, sort_keys=True) + ';',
         '})(window);']
open(os.path.join(ROOT, 'web', 'js', 'logos.js'), 'w', encoding='utf-8').write('\n'.join(lines) + '\n')
print('wrote web/js/logos.js', os.path.getsize(os.path.join(ROOT, 'web', 'js', 'logos.js')))
