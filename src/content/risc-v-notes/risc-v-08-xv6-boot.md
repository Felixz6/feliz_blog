---
title: "xv6 启动流程深入分析"
slug: risc-v-08-xv6-boot
description: "启动代码先建立最小执行环境，再配置特权状态并进入 S-mode；内核完成每个 hart 的初始化后，创建第一个用户进程。"
pubDate: 2026-09-23
cover: "/blog-covers/cover-11.webp"
tags: ["RISC-V","xv6","计算机系统","学习笔记"]
category: "tech"
---
> **一句话：** 启动代码先建立最小执行环境，再配置特权状态并进入 S-mode；内核完成每个 hart 的初始化后，创建第一个用户进程。

## 本章导航

[全局路线](#1-启动全景) · [早期入口](#2-entry-和-start) · [特权级移交](#3-从-m-mode-进入-s-mode) · [内核初始化](#4-main-与内核初始化) · [首个用户进程](#5-进入用户态)

## 学习目标

- 说清 `entry.S`、`start.c`、`main()` 的职责边界。
- 解释 `mret` 与 `sret` 不是同一条返回路径。
- 能沿源码追踪内核启动至第一个用户进程。

## 1. 启动全景

```text
QEMU / 平台固件
      ↓ 交给内核入口
kernel/entry.S：设置早期栈、转入 C 启动代码
      ↓
kernel/start.c：M-mode 准备、配置状态与委派
      ↓ mret
kernel/main.c：S-mode 内核初始化（各 hart 协作）
      ↓
userinit / initcode：创建并运行第一个用户进程
      ↓
用户态 init 程序继续启动用户环境
```

具体启动入口、固件参与方式和 QEMU 参数取决于平台与构建选项。MIT xv6 的常见 QEMU 配置会让内核从早期机器态代码开始；其他板卡可能由 OpenSBI 等固件先进入 S-mode。

## 2. entry 和 start

`kernel/entry.S` 是低层入口，执行时 C 运行环境尚未完全建立。它会使用早期提供的 hart ID，给每个 hart 准备栈空间，然后调用 `start`。多核环境下每个 hart 都有自己的栈，避免入口阶段互相覆盖。

`kernel/start.c` 执行依赖特权机器态的准备工作：设置初始状态、配置异常/中断委派与机器态入口/定时器相关状态，并将返回地址指向内核的 `main`。应以当前 checkout 中 `entry.S` 与 `start.c` 的指令和注释为准。

## 3. 从 M-mode 进入 S-mode

`mstatus` 中的 MPP 字段决定 `mret` 返回后的特权级；启动代码将目标设为 Supervisor，再用 `mret` 完成移交。`medeleg`、`mideleg` 等寄存器可把后续相应异常/中断交由 S-mode 处理。地址转换最初通常保持关闭，内核会在合适阶段建立页表后再启用。

| 指令 | 常见用途 | 返回到哪里/什么级别 |
|---|---|---|
| `mret` | 从 Machine-mode 异常/启动代码返回 | 由机器态状态字段决定 |
| `sret` | 从 Supervisor-mode trap 返回 | 由 supervisor 状态字段决定 |

**mret 不等于 sret。** 前者属于机器态控制流，后者用于 supervisor trap 返回用户/先前权限级。用户程序的普通函数 `ret` 又是另一回事。

## 4. main 与内核初始化

`main()` 根据 hart ID 协调初始化。常见初始化职责包括：控制台输出、物理内存分配器、内核页表、每核 trap 状态、进程表、PLIC/设备、中断与文件系统等。部分步骤只由启动 hart 执行，其他 hart 等待初始化完成后再启用各自状态。

研究时不要只看 `main()` 的函数名列表，还要看顺序和依赖：

- 内存分配器要先能提供页，后续页表和进程栈才能创建。
- 内核映射就绪后，相关 hart 才能切换到该页表。
- 中断入口配置与设备初始化要在允许相应中断前完成。
- 文件系统依赖块设备与 buffer cache 等设施。

## 5. 进入用户态

初始化完成后，内核创建第一个进程。初始用户代码通过系统调用准备执行 `init` 用户程序，返回路径会配置用户寄存器、用户 PC、页表和 trampoline 入口，再执行 `sret` 进入 U-mode。之后用户程序可以通过系统调用请求内核服务。

阅读时可逐项核对：第一个进程的 trapframe 如何构造、用户入口地址是什么、`satp` 在何时写入、`sepc` 指向哪里、`sstatus` 如何设定。每个细节都应对应当前 xv6 版本中的初始化代码，而不是从其他课程分支照搬。

> **核心结论：** 启动不是单一的“跳到 main”，而是逐步建立栈、特权状态、内存映射、中断/设备和进程状态；`mret` 完成机器态移交，`sret` 完成后续 supervisor trap 返回。

**下一篇：** [09 · xv6 进程管理](/risc-v-notes/risc-v-09-xv6-process-management/) → [10 · xv6 虚拟内存与页表](/risc-v-notes/risc-v-10-xv6-virtual-memory/)
