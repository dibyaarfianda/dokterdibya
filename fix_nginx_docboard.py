import re

with open('/etc/nginx/sites-enabled/dokterdibya.com', 'r') as f:
    content = f.read()

old = re.search(r'location \^\~ /docboard/.*?\}', content, re.DOTALL)
if old:
    nb = (
        'location ^~ /docboard/ {\n'
        '        alias /var/www/dokterdibya/docboard/dist/;\n'
        '        add_header Cache-Control "no-store, no-cache, must-revalidate" always;\n'
        '        try_files $uri $uri/ /docboard/index.html;\n'
        '    }'
    )
    content = content[:old.start()] + nb + content[old.end():]
    with open('/etc/nginx/sites-enabled/dokterdibya.com', 'w') as f:
        f.write(content)
    print('Fixed docboard nginx block')
else:
    print('docboard block not found')
