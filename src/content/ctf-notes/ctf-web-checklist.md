---
title: "CTF Web Checklist"
description: "覆盖指纹识别、常查路径、参数测试与 SQLi 初测的通用检查清单。"
order: 7
---

# CTF Web Checklist

## 1. 指纹识别
- Server
- X-Powered-By
- Set-Cookie
- 前端框架
- 路由风格
- 报错特征

## 2. 常查路径
- /robots.txt
- /sitemap.xml
- /.git/
- /.svn/
- /.env
- /backup.zip
- /www.zip
- /source.zip
- /swagger
- /api-docs
- /actuator
- /phpinfo.php
- /admin
- /debug
- /test
- /dev

## 3. 参数测试
- id
- file
- path
- url
- cmd
- template
- search
- query
- redirect
- next
- callback
- preview
- include
- page

## 4. SQLi 最小测试
- '
- "
- )
- '
- order by 100
- union select
- and 1=1
- and 1=2

## 5. SSTI 最小测试
- {{7*7}}
- ${7*7}
- <%= 7*7 %>
- #{7*7}

## 6. 文件包含/路径穿越
- ../
- ..%2f
- ..%252f
- /etc/passwd
- php://filter
- file://

## 7. SSRF
- http://127.0.0.1
- http://localhost
- file://
- gopher://
- dict://
- redirect 绕过
- DNS rebinding 思路

## 8. 文件上传
- 后缀绕过
- MIME 绕过
- 双写
- 大小写
- .htaccess
- 条件竞争
- 图片马

## 9. 鉴权/JWT/Session
- 越权
- role 改写
- kid/jku
- none
- 弱密钥
- session fixation

## 10. 前端 JS
- 隐藏接口
- 参数名
- 调试接口
- token 泄露
- 路由线索