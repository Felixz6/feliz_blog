---
title: "xv6 源码分析"
slug: risc-v-07-xv6-source-tour
description: "xv6 是一套精简的类 Unix 教学操作系统；阅读它的关键，是沿着“用户态请求 → 内核子系统 → 返回用户态”追踪一条具体路径。"
pubDate: 2026-09-23
cover: "/blog-covers/cover-11.webp"
tags: ["RISC-V","xv6","计算机系统","学习笔记"]
category: "tech"
---
> **一句话：** xv6 是一套精简的类 Unix 教学操作系统；阅读它的关键，是沿着“用户态请求 → 内核子系统 → 返回用户态”追踪一条具体路径。

## 本章导航

[xv6 是什么](#1-xv6-是什么) · [目录地图](#2-先认目录和关键文件) · [系统结构](#3-内核如何组织) · [如何读代码](#4-建议的源码阅读方法)

## 学习目标

- 认识 xv6 RISC-V 版本的主要子系统和源码位置。
- 了解 U/S/M 特权级与用户/内核边界。
- 使用 QEMU、GDB 和教材从可观察的路径入手读源码。

## 1. xv6 是什么

xv6 是 MIT 教学用的类 Unix 操作系统，受 Unix Version 6 启发，并在 RISC-V 多核机器模型上实现。它小而完整，适合学习系统调用、页表、进程、驱动、锁和文件系统；**它不是以生产环境功能与硬化为目标的通用发行版**。

本文以 MIT 的 [xv6 RISC-V 教材](https://mit-pdos.github.io/xv6-riscv-book/)和[源码仓库](https://github.com/mit-pdos/xv6-riscv)为参照。课程分支会增加实验代码或改变细节；阅读时把教材、提交版本和本地源码对应起来。

## 2. 先认目录和关键文件

| 文件/目录 | 主要职责 |
|---|---|
| `kernel/entry.S`、`kernel/start.c` | 每个 hart 的早期入口和机器态到 supervisor 态的准备 |
| `kernel/main.c` | 内核主要初始化编排 |
| `kernel/proc.c`、`kernel/swtch.S` | 进程状态、调度和上下文切换 |
| `kernel/vm.c` | 内核映射、用户页表和地址空间操作 |
| `kernel/trampoline.S`、`kernel/trap.c` | 用户/内核 trap 入口、保存状态和返回路径 |
| `kernel/syscall.c`、`kernel/sysproc.c`、`kernel/sysfile.c` | 系统调用分派及具体实现 |
| `kernel/fs.c`、`kernel/log.c`、`kernel/bio.c` | inode、块映射、日志和 buffer cache |
| `user/` | 用户程序、启动代码和系统调用 stub |
| `Makefile` | 目标工具链、构建规则、QEMU/GDB 目标 |

## 3. 内核如何组织

可以把执行路径分成四层：

```text
用户程序（user/）
       │ 系统调用指令与 ABI
       ▼
trap / syscall 入口（trampoline.S、trap.c、syscall.c）
       │ 选择服务并检查/转换参数
       ▼
子系统（proc、vm、fs、device driver）
       │ 操作内核数据结构、内存与设备
       ▼
RISC-V 硬件接口（CSR、页表、特权级、MMIO）
```

RISC-V 特权架构定义 M（Machine）、S（Supervisor）、U（User）等权限级；具体实现可以支持不同组合。xv6 的内核主要在 S-mode 执行，用户程序在 U-mode 执行；启动阶段会借助 M-mode 固件/代码完成移交。特权级切换不等于“换了 CPU”，而是改变执行权限和相关架构状态。

## 4. 建议的源码阅读方法

1. 固定版本：记录仓库分支或 commit，并查看仓库 `README` / `Makefile`。
2. 选一个入口：例如用户程序的 `write`、`fork` 或 `exec`。
3. 沿函数和汇编边界追踪：谁设置寄存器、在哪里触发 trap、内核如何取参数、结果如何返回。
4. 观察状态：用 QEMU/GDB 在关键函数设断点，查看寄存器、页表、进程状态或磁盘块。
5. 用教材解释设计，再以当前源代码核对实现细节。

推荐顺序：系统调用接口 → trap/页表 → 进程调度 → 文件系统 → 驱动与并发。每读一个概念，挑一条端到端路径验证，而不是先背完整目录。

> **核心结论：** xv6 是把操作系统概念落到真实代码上的教学样本；理解路径和不变量，比记文件名更有用。

**下一篇：** [08 · xv6 启动流程深入分析](/risc-v-notes/risc-v-08-xv6-boot/) → [09 · xv6 进程管理](/risc-v-notes/risc-v-09-xv6-process-management/)
