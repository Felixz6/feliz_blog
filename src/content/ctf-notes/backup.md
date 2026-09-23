---
title: "网站备份文件排查"
description: "常见备份后缀、编辑器残留、命名习惯与整站归档文件排查清单。"
order: 6
---

# 1. 先猜首页入口文件

最常见先试：

```text
/index.php
/index.html
/index.htm
/default.php
/home.php
```

然后围绕这些文件去加后缀。

------

# 2. 最常见的单文件备份后缀

这是命中率最高的一组：

```text
/index.php.bak
/index.php~
/index.php.old
/index.php.orig
/index.php.save
/index.php.swp
/index.php.swo
/index.php.tmp
/index.php.temp
/index.php.txt
/index.phps
/index.php1
/index.php.1
/index.php.rar
/index.php.zip
```

如果首页像静态页，再试：

```text
/index.html.bak
/index.html~
/index.html.old
/index.html.orig
/index.html.swp
/index.html.txt
```

------

# 3. 编辑器/IDE 产生的文件

这类也很常见：

```text
/index.php.swp
/index.php.swo
/index.php.swn
/index.php~
/.#index.php
/index.php.un~
```

来源通常是：

- vim：`.swp` `.swo`
- emacs：`~` `.#文件名`
- 某些编辑器：`.tmp` `.bak`

------

# 4. 开发人员手动备份常见命名

很多题会故意出这种：

```text
/index_bak.php
/index-bak.php
/index_backup.php
/index-backup.php
/index_old.php
/index-old.php
/index_copy.php
/copy_index.php
/bak.php
/test.php
/index2.php
/index1.php
```

同理，别只盯着“原文件+后缀”，也要试“**改名备份**”。

------

# 5. 整站压缩包 / 网站根目录备份

这个价值很高，命中就能直接拿整站源码：

```text
/backup.zip
/backup.rar
/backup.tar.gz
/backup.tar
/web.zip
/www.zip
/site.zip
/root.zip
/html.zip
/public_html.zip
/wwwroot.zip
/htdocs.zip
/src.zip
/code.zip
```

再扩展一些常见名字：

```text
/beifen.zip
/db.zip
/archive.zip
/website.zip
/project.zip
```

------

# 6. 目录级备份

有时候不是首页文件泄露，而是某个目录被整体打包：

```text
/admin.zip
/upload.zip
/include.zip
/config.zip
/php.zip
```

或者目录备份后缀形式：

```text
/admin.rar
/admin.tar.gz
```

------

# 7. 配置文件和敏感文件的备份

拿 flag 不一定靠 `index.php`，很多时候靠配置文件：

```text
/config.php.bak
/config.php~
/config.php.old
/config.inc.php
/config.inc.php.bak
/db.php.bak
/db_config.php.bak
/conn.php.bak
/common.php.bak
/flag.php.bak
```

如果是框架站，还可以猜：

```text
/.env
/.env.bak
/.env.save
```

------

# 8. 特殊但值得试的源码泄露点

这类不是“备份后缀”，但常跟这类题一起出现：

```text
/index.phps
/.git/
 /.git/config
/.svn/entries
/.DS_Store
/robots.txt
```

其中 `index.phps` 很值得优先试。

------

# 9. 实战优先级建议

最先试这一小组，效率最高：

```text
/index.php.bak
/index.php~
/index.php.old
/index.php.swp
/index.phps
/backup.zip
/www.zip
/wwwroot.zip
```

再试第二组：

```text
/index_bak.php
/index-backup.php
/index_old.php
/config.php.bak
/.env
/.git/config
```

------

# 10. 你可以直接套的字典思路

## 针对首页文件

假设入口是 `index.php`，就试：

```text
index.php.bak
index.php~
index.php.old
index.php.orig
index.php.save
index.php.swp
index.php.tmp
index.php.txt
index.phps
index.php.zip
index.php.rar
index_bak.php
index-backup.php
index_old.php
index1.php
index2.php
```

## 针对整站

```text
backup.zip
backup.rar
backup.tar.gz
www.zip
web.zip
site.zip
root.zip
wwwroot.zip
public_html.zip
code.zip
src.zip
```

## 针对配置

```text
config.php.bak
config.php.old
config.inc.php
db.php.bak
conn.php.bak
common.php.bak
.env
.env.bak
```

------

# 11. 做题时的一个经验

先按这个顺序猜：

1. `index.phps`
2. `index.php.bak`
3. `index.php~`
4. `index.php.old`
5. `index.php.swp`
6. `backup.zip`
7. `www.zip`
8. `wwwroot.zip`
9. `config.php.bak`
10. `.git/config`

这 10 个就能覆盖很多新手赛题。

