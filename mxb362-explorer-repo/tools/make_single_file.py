"""Bundle the multi-file page (index.html + css/ + data/ + js/) into one self-contained HTML file.
Usage: python3 tools/make_single_file.py   ->  writes mortality_explorer_single.html next to index.html"""
import re,os
root=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..')
rd=lambda p:open(os.path.join(root,p),encoding='utf-8').read()
h=rd('index.html')
h=h.replace('<link rel="stylesheet" href="css/style.css">','<style>\n'+rd('css/style.css')+'</style>')
h=re.sub(r'<script src="([^"]+)"></script>\n?',lambda m:'<script>\n'+rd(m.group(1))+'\n</script>\n',h)
open(os.path.join(root,'mortality_explorer_single.html'),'w',encoding='utf-8').write(h)
print('written')
