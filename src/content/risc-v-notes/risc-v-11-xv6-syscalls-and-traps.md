---
title: "xv6 系统调用与 Trap"
slug: risc-v-11-xv6-syscalls-and-traps
description: "系统调用让用户程序有控制地请求内核服务；Trap 是 CPU 从当前执行流转入受控处理路径的机制。"
pubDate: 2026-09-23
cover: "/blog-covers/cover-11.webp"
tags: ["RISC-V","xv6","计算机系统","学习笔记"]
category: "tech"
---
> **一句话：** 系统调用让用户程序有控制地请求内核服务；Trap 是 CPU 从当前执行流转入受控处理路径的机制。

## 本章导航

[系统调用](#1-系统调用做什么) · [用户入口](#2-从用户-stub-到-ecall) · [内核处理](#3-trampoline-usertrap-与分派) · [返回路径](#4-返回用户态) · [边界检查](#5-参数与用户内存边界)

## 学习目标

- 画出 xv6 系统调用从用户代码到内核实现再返回的路径。
- 认识 `ecall`、`sepc`、`scause`、`stvec`、`sstatus` 的职责。
- 说明为什么系统调用参数中的用户指针必须经过检查。

## 1. 系统调用做什么

用户态代码不能直接执行所有特权操作，也不应直接控制内核数据结构。系统调用提供稳定入口：用户代码请求 `read`、`write`、`fork` 等服务，内核验证参数并代表系统执行。

```text
用户程序 → 用户态 stub → ecall → trap 入口 → syscall 分派
          → 内核服务函数 → 返回值 → 用户态继续执行
```

Trap 是更广的概念，包含同步异常、系统调用、外部/定时器中断等；系统调用只是其中一种由软件指令触发的情况。

## 2. 从用户 stub 到 ecall

用户代码通常调用一个 C 函数名，例如 `write(fd, buf, n)`。用户库中的汇编 stub 把系统调用号放在 `a7`，参数按 xv6 约定放入 `a0`–`a5`，然后执行 `ecall`。系统调用号清单位于 xv6 的 syscall 头文件中；构建脚本会生成对应 stub。

在 RISC-V 上，从 U-mode 执行 `ecall` 会触发环境调用异常。硬件记录异常原因和相关返回状态，再按当前特权控制转入 trap 路径。对 xv6 用户系统调用，`sepc` 指向触发异常的 `ecall` 指令；内核处理系统调用时会让返回 PC 越过该指令，避免再次执行它。

## 3. trampoline、usertrap 与分派

| 阶段 | 常见代码位置 | 主要工作 |
|---|---|---|
| trap 汇编入口 | `kernel/trampoline.S` 的 `uservec` | 切换到内核可用状态，保存用户寄存器到 trapframe |
| 用户 trap 处理 | `kernel/trap.c` 的 `usertrap` | 记录/检查 trap 原因；系统调用路径推进 PC 并调用分派器 |
| 系统调用分派 | `kernel/syscall.c` | 读取 a7 中的编号，选择对应 handler |
| 具体实现 | `kernel/sysproc.c`、`kernel/sysfile.c` 等 | 执行进程、文件或其他子系统操作 |

系统调用实现通常返回整数结果，分派器把结果写入 trapframe 的 a0，供用户态代码接收。不同 xv6 版本可能调整 helper、表项或函数名；应跟随当前代码搜索调用链。

## 4. 返回用户态

内核准备用户返回状态，包括用户 PC、用户寄存器、目标特权状态、trap 入口配置和用户页表，然后跳到 trampoline 的返回代码，切换回用户页表并执行 `sret`。`sret` 根据 supervisor 状态寄存器中的先前权限级信息恢复执行。

| CSR | 常见职责 |
|---|---|
| `sepc` | 保存 supervisor trap 返回地址 |
| `scause` | 保存 trap 原因编码 |
| `stvec` | supervisor trap 入口地址/模式 |
| `sstatus` | supervisor 状态，包括返回特权级等控制位 |
| `satp` | 地址转换模式与根页表信息 |

这些 CSR 是特权状态，不是系统调用参数寄存器。读 CSR 的方式、可访问权限和副作用由特权架构定义。

## 5. 参数与用户内存边界

内核不能信任用户提供的整数、长度、文件描述符或地址。尤其用户指针只在用户页表上下文中有意义；处理前要检查范围、权限和溢出，并通过 `copyin`/`copyout` 等函数搬运数据。只检查指针非零并不代表它有效，也不能防止跨页或越界问题。

> **核心结论：** `ecall` 只触发受控的特权转换；真正的安全边界由内核的参数验证、页表权限和数据复制共同建立。

**下一篇：** [12 · xv6 文件系统](/risc-v-notes/risc-v-12-xv6-filesystem/) · [返回索引](/risc-v-notes/risc-v-xv6-learning-notes/)
