
import codecs
content = open('js/_graph_v2.js', 'r', encoding='utf-8').read()
with codecs.open('js/graph-viz.js', 'w', encoding='utf-8') as f:
    f.write(content)
print('Copied', len(content), 'chars')
