---
title: "CTF PHP 反序列化流程图"
description: "整理反序列化入口、可控数据、可用类与 POP 链的分析步骤。"
order: 4
---

------

## 🧠 CTF PHP 反序列化完整做题流程图

```
① 发现可控点/入口
        ↓
② 确认是否存在反序列化（unserialize）
        ↓
③ 确认可控数据的载体（GET/POST/Cookie/Session/Phar…）
        ↓
④ 梳理可用类（源码/提示/自动加载）
        ↓
⑤ 找魔术方法触发点（__wakeup/__destruct/__toString/__call…）
        ↓
⑥ 定位“危险汇点”（eval/include/file_put_contents/system…）
        ↓
⑦ 组 POP 链（属性赋值 → 触发路径 → 汇点执行）
        ↓
⑧ 处理限制（过滤/长度/字符集/不可见字符/私有属性名）
        ↓
⑨ 选择落地方式（直接回显/写文件/读文件/SSRF/命令执行）
        ↓
⑩ 构造 payload + 调试 + 拿 flag
```

------

## ① 发现可控点/入口（你要找“谁在 unserialize”）

典型入口长这样：

- `unserialize($_GET['x'])`
- `unserialize($_POST['data'])`
- `unserialize($_COOKIE['auth'])`
- `unserialize(file_get_contents(...))`
- `session_decode()` / session 反序列化（题里也常见）

**做题习惯：**先 grep 关键字：`unserialize`、`__destruct`、`__wakeup`、`phar://`、`session`。

------

## ② 确认是否存在反序列化

你要确认两件事：

- 是否真的在执行 `unserialize`
- 是否能让你的输入进入 `unserialize`

常见现象：

- 报错：`unserialize(): Error at offset ...`
- 页面行为变化（有/无、跳转、输出不同）
- 反序列化后对象被使用（例如触发 `__destruct` 输出/写文件）

------

## ③ 确认可控数据载体（你到底控制的是哪一坨）

CTF 常见的“输入来源”：

1. **GET/POST**：最直接
2. **Cookie**：比如 `auth=`、`user=`
3. **Session**：先登录写 session，再触发解析
4. **Phar 反序列化**：只要代码里出现文件操作 + `phar://` 相关机会（如 `file_exists`, `file_get_contents`, `exif_read_data` 等对 phar 元数据敏感的调用），就可能走 phar metadata 触发
5. **缓存/日志文件**：题里也会让你污染某文件再被 `unserialize`

------

## ④ 梳理可用类（“有哪些积木可以拼链”）

你需要拿到或推断：

- 题目源码（最理想）
- 提示里给的类名/文件名
- 自动加载规则（`spl_autoload_register` / composer）

把类都过一遍，重点看：

- 成员属性（public/protected/private）
- 是否有文件/命令/模板渲染/反射相关逻辑
- 是否有可控路径、可控内容写入、可控函数名调用

------

## ⑤ 找魔术方法触发点（“什么时候会自动执行”）

常见触发顺序/场景：

- `__wakeup()`：反序列化立刻触发（很多题就靠它）
- `__destruct()`：脚本结束时触发（CTF 最常见收尾点）
- `__toString()`：对象被当成字符串拼接/echo 时触发
- `__invoke()`：对象当函数用时触发
- `__call()` / `__get()` / `__set()`：访问不存在的方法/属性时触发

**做题口诀：**

> 先找 `__destruct` / `__wakeup`，再看里面能不能一路走到危险操作。

------

## ⑥ 定位“危险汇点”（终点：能读/写/执行）

你最终想走到的操作（CTF 常见）：

- 读文件：`file_get_contents`, `readfile`, `fopen/fgets`
- 写文件：`file_put_contents`, `fwrite`, `rename`
- 包含执行：`include/require/include_once`
- 命令执行：`system/exec/shell_exec/passthru/popen`
- 模板/回调：`call_user_func`, `preg_replace(/e)`, `assert`, `eval`（题里偶尔）

你要做的是：**让对象属性可控 → 让执行路径使用这些属性**。

------

## ⑦ 组 POP 链（从“可控属性”连到“危险汇点”）

POP 链本质就是三段：

1. **入口对象**：你能构造的对象（能被 unserialize 成功）
2. **属性赋值**：把关键属性塞成你想要的值
3. **触发路径**：通过魔术方法/普通方法调用把数据带到汇点

做题时建议画一条链：

- 触发点：`A::__destruct()`
- 中转：`$this->b->run($this->x)`
- 汇点：`B::run()` 里 `include($arg)` 或 `file_put_contents($path,$data)` 等

------

## ⑧ 处理限制与坑点（90% 卡在这里）

CTF 常见限制清单：

- **过滤关键字**：`O:`、`s:`、`:`、`"`、`\0` 等
- **长度校验**：序列化字符串 `s:<len>:"..."` 长度必须对
- **私有/保护属性名**：PHP 序列化里会带特殊前缀（包含不可见字符），容易写错
- **禁止对象反序列化**：`unserialize($x, ['allowed_classes'=>false])` 或白名单
- **wakeup 绕过**：有些题利用对象数量/引用/数组结构触发绕过（看题目版本与逻辑）
- **编码问题**：URL 编码、Base64 包裹、gzip 包裹、`stripslashes` 等

**调试建议：**本地起同版本 PHP，把题目类复制出来，写个小脚本 `unserialize($payload)` 看触发路径。

------

## ⑨ 选择落地方式（拿 flag 的“打法”）

按题型选：

- **直接回显**：最爽（echo/print/报错带出）
- **读文件**：`/flag`、`flag.php`、`/var/www/html/flag` 等
- **写文件 getshell**：写到 web 目录再访问（CTF 很常见）
- **include 执行**：包含你能控制内容的文件
- **SSRF/内网**：如果链里有 curl/file_get_contents(URL)

------

## ⑩ 构造 payload + 调试

建议固定流程：

1. 先做一个**最小对象**：能反序列化不报错
2. 再让它**稳定触发**魔术方法
3. 最后逐步把属性补齐，直到命中汇点
4. payload 如果被包裹（base64/json/urlencode），按题目要求套娃

------

## ✅ 快速“检查表”（做题时从上到下打勾）

-  是否能控制进入 `unserialize` 的内容？
-  是否能成功反序列化成对象（无 offset 错）？
-  触发点是 `__wakeup` 还是 `__destruct`？
-  哪些属性必须可控？
-  汇点是哪一个危险函数？
-  有无 `allowed_classes` 限制？
-  有没有过滤 `O:`/`:`/引号/`\0`？
-  私有属性名是否写对（含不可见前缀）？
-  payload 是否需要 base64/urlencode？
-  最终落地是读 flag 还是写文件？

------

