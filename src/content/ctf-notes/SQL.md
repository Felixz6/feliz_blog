---
title: "CTF SQL 注入完整流程图"
description: "从参数发现到注入类型、数据库判断与常见利用路径的 SQL 注入排查流程。"
order: 1
---

# 🧠 CTF SQL 注入完整流程图

```
① 发现参数
        ↓
② 判断是否存在注入
        ↓
③ 判断注入类型
        ↓
④ 判断数据库类型
        ↓
⑤ 判断字段数
        ↓
⑥ 找回显点
        ↓
⑦ 获取数据库名
        ↓
⑧ 获取表名
        ↓
⑨ 获取列名
        ↓
⑩ dump 关键数据
```

------

# 🔎 第一步：发现参数

找所有可控点：

- GET 参数
- POST 参数
- Cookie
- Header（User-Agent / X-Forwarded-For）
- 隐藏字段

例：

```
?preset=chino.jpg
?id=1
```

------

# 🧨 第二步：判断是否有注入

测试特殊字符：

```
'
"
'
)
--
```

看是否：

- 报 SQL 错误
- 500
- 页面变化

------

# 🧩 第三步：判断注入类型

| 类型       | 特征                  |
| ---------- | --------------------- |
| 报错注入   | 页面直接显示 SQL 错误 |
| Union 注入 | 页面有数据回显        |
| 布尔盲注   | 页面只有“有/无”变化   |
| 时间盲注   | 页面延迟              |

------

# 🗃 第四步：判断数据库类型

看报错关键词：

| 报错内容                             | 数据库 |
| ------------------------------------ | ------ |
| You have an error in your SQL syntax | MySQL  |
| SQLite error                         | SQLite |
| PostgreSQL                           | PG     |
| SQL Server                           | MSSQL  |

如果没报错 → 用 sqlmap 自动识别。

------

# 🧮 第五步：判断字段数（Union 注入必做）

用：

```
order by 1
order by 2
order by 3
...
```

直到报错。

假设：

```
order by 4 报错
```

说明字段数是 3。

------

# 🎯 第六步：找回显点

构造：

```
union select 1,2,3
```

看页面显示哪个数字。

那个位置就是可控输出位。

------

# 🏷 第七步：获取数据库名

MySQL 常用：

```
database()
```

------

# 📂 第八步：获取表名

查：

```
information_schema.tables
```

------

# 📑 第九步：获取列名

查：

```
information_schema.columns
```

------

# 🏁 第十步：dump 数据

一般 CTF 关键表名：

- flag
- users
- admin
- secret

关键列：

- flag
- password
- passwd
- value

------

# 🔥 如果是盲注怎么办？

流程变成：

```
① 判断真假页面
② 构造布尔条件
③ 爆数据库长度
④ 爆数据库字符
⑤ 爆表
⑥ 爆列
⑦ 爆数据
```

盲注核心思想：

> 一次猜一个字符。

------

# ⚙️ sqlmap 实战流程

标准流程：

```
1. 先 -p 指定参数
2. 加 --level=5 --risk=3
3. 识别数据库
4. --dbs
5. -D xxx --tables
6. -D xxx -T xxx --columns
7. -D xxx -T xxx --dump
```

------

# 🧠 CTF 常见坑

| 坑         | 解决                 |
| ---------- | -------------------- |
| 过滤空格   | tamper=space2comment |
| 过滤 union | tamper=between       |
| 过滤大小写 | tamper=randomcase    |
| 过滤注释   | 用 # 或 /*! */       |
| 过滤 and   | 用 &&                |

------

# 🚀 终极思维总结

做题本质是三件事：

```
1️⃣ 让 SQL 语句闭合
2️⃣ 让它执行你写的语句
3️⃣ 让结果显示出来
```

------

