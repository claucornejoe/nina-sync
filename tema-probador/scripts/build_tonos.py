"""Genera tonos-labios.json para el probador virtual.
Une tonos_labios_manual.csv (EAN;hex;acabado, colores aproximados puestos a mano)
con el catálogo de maquillaje (precio, stock, foto, handle de Shopify)."""
import csv, json, re, sys, os
base = os.path.dirname(os.path.abspath(__file__))
cat = '/mnt/project-files/catalogo/maquillaje/'
precios = {r['EAN']: r for r in csv.DictReader(open(cat+'maquillaje-precios.csv'), delimiter=';')}
handle, cur = {}, None
for r in csv.DictReader(open(cat+'maquillaje-shopify.csv')):
    cur = r['Handle'] or cur
    handle[r['Variant SKU']] = (cur, r['Image Src'])
TONO_FIJO = {'0840122900273': 'Motivate'}
def limpia_tono(t):
    t = re.sub(r'\s+Color\s+\S+$', '', t)
    t = re.sub(r'^24h Tono\s+', '', t)
    t = re.sub(r'\s+1un$', '', t)
    return t.replace('-', ' ', 1) if re.match(r'^\d+-', t) else t
def limpia_prod(f, marca):
    f = re.sub(r'\s+\d+([,.]\d+)?\s?(g|ml|u|U)\b.*$', '', f)
    f = re.sub(r'\s+(Pintalabios|Barra De Labios|Brillo De Labios|Perfilador De Labios|Tinte Para Labios.*|Lápiz De Labios.*)\b.*$', lambda m: ' '+m.group(1).split(' y ')[0], f)
    f = re.sub(r',\s*Tono$', '', f)
    f = re.sub(r'^(Essence Cosmetics|Estee Lauder|Estée Lauder|Rare Beauty|'+re.escape(marca)+r')\s+', '', f)
    return f[:60].strip()
out = []
for r in csv.DictReader(open(os.path.join(base, 'tonos_labios_manual.csv')), delimiter=';'):
    p = precios[r['ean']]
    h, img = handle.get(r['ean'], ('', ''))
    out.append(dict(ean=r['ean'], marca=p['Marca'].replace('Essence Cosmetics', 'Essence'),
        producto=limpia_prod(p['Ficha'], p['Marca']),
        tono=TONO_FIJO.get(r['ean']) or limpia_tono(p['Tono']),
        hex=r['hex'], acabado=r['acabado'], precio=float(p['Precio']),
        stock=int(p['Stock'] or 0), handle=h,
        img=img or 'https://images.btswholesaler.com/imgs/productos_cosmetica/imagenes/'+r['ean']))
out.sort(key=lambda x: -x['stock'])
json.dump(out, open(sys.argv[1] if len(sys.argv) > 1 else os.path.join(base, '..', 'tonos-labios.json'), 'w'), ensure_ascii=False, indent=0)
for x in out: print(x['marca'], '|', x['producto'], '|', x['tono'], '|', x['handle'][:30])
