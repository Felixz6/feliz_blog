---
title: "xv6 进程管理"
slug: risc-v-09-xv6-process-management
description: "进程是执行状态与资源的集合；调度器保存当前执行上下文、选择可运行进程，再恢复另一个进程。"
pubDate: 2026-09-23
cover: "/blog-covers/cover-11.webp"
tags: ["RISC-V","xv6","计算机系统","学习笔记"]
category: "tech"
---
> **一句话：** 进程是执行状态与资源的集合；调度器保存当前执行上下文、选择可运行进程，再恢复另一个进程。

## 本章导航

[进程结构](#1-进程包含什么) · [状态与调度](#2-进程状态与调度) · [上下文切换](#3-context-与-swtch) · [进程生命周期](#4-fork-exec-exit-wait) · [睡眠唤醒](#5-sleep-与-wakeup)

## 学习目标

- 读懂 xv6 中进程状态、内核栈、trapframe 和 context 的区别。
- 解释调度器怎样让出 CPU 并恢复另一个进程。
- 说清 fork、exec、exit、wait 的职责边界。

## 1. 进程包含什么

xv6 的 `struct proc` 把进程运行所需的状态和资源关联起来，常见字段包括进程状态、PID、内核栈、用户页表、trapframe、内核切换 context、打开文件表、当前目录和进程名。具体字段以当前 `kernel/proc.h` 为准。

| 对象 | 保存什么 | 何时使用 |
|---|---|---|
| 用户页表 | 用户虚拟地址到物理页的映射 | 运行用户代码、访问用户内存 |
| trapframe | 用户寄存器等 trap 返回状态 | 用户态进入内核/返回用户态 |
| context | 内核线程切换所需的 callee-saved 寄存器、sp、ra 等 | `swtch` 在内核调度路径间切换 |
| 内核栈 | trap 和内核函数调用的栈帧 | 内核态处理当前进程 |

**trapframe 不等于 context。** 前者保存用户态边界状态；后者保存内核调度切换所需状态。

## 2. 进程状态与调度

常见 xv6 状态包括：

| 状态 | 含义 |
|---|---|
| `UNUSED` | 槽位空闲 |
| `USED` | 槽位已分配，初始化/回收过程中 |
| `SLEEPING` | 等待某个 channel/事件 |
| `RUNNABLE` | 可以被调度，但当前没有占用 CPU |
| `RUNNING` | 正在某个 hart 上运行 |
| `ZOMBIE` | 已退出，等父进程回收状态 |

`scheduler()` 在每个 hart 上遍历进程表，在锁保护下找到可运行进程，准备其状态并通过 `swtch` 将执行权交给进程。时钟中断等路径可能使运行中的进程让出 CPU。状态转换和锁规则是正确性的关键；具体顺序请以 `kernel/proc.c` 为准。

## 3. context 与 swtch

`kernel/swtch.S` 保存当前内核 context 中需要跨调用保留的寄存器，再从目标 context 恢复寄存器、栈指针和返回地址。它通常不会保存全部用户寄存器；用户寄存器由 trap 路径处理。

```text
进程 A 的内核路径
    ↓ 保存 A 的 kernel context
scheduler 的 context
    ↓ 选择 B 并恢复 B 的 kernel context
进程 B 的内核路径
```

所谓“切换进程”，不是把整块 RAM 从 CPU 搬走；核心是改变当前执行上下文，并由页表切换等机制提供相应地址空间。

## 4. fork、exec、exit、wait

| 系统调用 | 做什么 | 不做什么 |
|---|---|---|
| `fork()` | 创建子进程；初始时复制父进程的用户内存和相关状态 | 不装入另一份可执行文件 |
| `exec(path, argv)` | 用新程序映像替换当前进程的用户地址空间和用户寄存器入口 | 通常不创建新 PID/新进程 |
| `exit(status)` | 结束当前进程，关闭/释放相应资源并进入僵尸态供回收 | 不由退出者自己立即释放父进程还要读取的退出状态 |
| `wait()` | 父进程等待并回收已退出子进程的状态/资源 | 不负责运行子进程 |

`fork` 后父子进程从相近的执行位置继续，但返回值不同：父进程得到子 PID，子进程得到 0。xv6 的基础实现复制用户内存；Copy-on-Write 是可选改进，不应误认为基础版本默认行为。

## 5. sleep 与 wakeup

进程等待锁、设备或其他事件时可进入 `SLEEPING`，调度器于是运行别的进程。事件完成后，`wakeup(channel)` 将匹配的睡眠进程标为可运行。channel 是内核用来关联等待者与事件的值。

睡眠与事件检查之间必须正确协调锁，否则可能出现**丢失唤醒**：事件已经发生，但进程仍进入睡眠而没人再唤醒。xv6 的 sleep/wakeup 实现展示了锁移交如何避免这个竞态。

> **核心结论：** 调度只会选择 `RUNNABLE` 进程；上下文切换保存的是继续执行所需状态；进程生命周期由 fork/exec/exit/wait 协作完成。

**下一篇：** [10 · xv6 虚拟内存与页表](/risc-v-notes/risc-v-10-xv6-virtual-memory/) → [11 · xv6 系统调用与 Trap](/risc-v-notes/risc-v-11-xv6-syscalls-and-traps/)
