---
title: "GCC 与 QEMU 环境"
slug: risc-v-06-gcc-and-qemu
description: "交叉编译器为目标 ISA 生成程序，QEMU 则在宿主机上模拟目标 CPU 或整台目标机器；二者用途不同。"
pubDate: 2026-09-23
cover: "/blog-covers/cover-11.webp"
tags: ["RISC-V","xv6","计算机系统","学习笔记"]
category: "tech"
---
> **一句话：** 交叉编译器为目标 ISA 生成程序，QEMU 则在宿主机上模拟目标 CPU 或整台目标机器；二者用途不同。

## 本章导航

[编译流程](#1-从源文件到可执行文件) · [工具链与目标](#2-选择目标工具链) · [ELF](#3-elf-文件与常看-section) · [QEMU](#4-qemu-的两种常见模式) · [调试与复现](#5-调试和项目组织)

## 学习目标

- 说清预处理、编译、汇编和链接各自的输入输出。
- 选择 Linux 应用、裸机或 xv6 对应的工具链和运行方式。
- 用 ELF 工具检查目标架构、符号和指令。

## 1. 从源文件到可执行文件

```text
hello.c
  │ 预处理：展开头文件、宏
  ▼
hello.i
  │ 编译：C → 汇编
  ▼
hello.s
  │ 汇编：汇编 → 可重定位目标文件
  ▼
hello.o
  │ 链接：组合目标文件和库，解析符号
  ▼
hello (ELF 可执行文件)
```

GCC 可将阶段拆开观察：

~~~bash
riscv64-linux-gnu-gcc -E hello.c -o hello.i
riscv64-linux-gnu-gcc -S hello.i -o hello.s
riscv64-linux-gnu-gcc -c hello.s -o hello.o
riscv64-linux-gnu-gcc hello.o -o hello
~~~

实际驱动程序可以一条命令完成多个阶段。`.o` 通常仍有未解析符号和重定位信息；链接器需要结合其他对象文件、库和启动代码才能生成最终可执行文件。

## 2. 选择目标工具链

| 工具链 | 目标环境 | 用途示例 |
|---|---|---|
| `riscv64-linux-gnu-gcc` | RISC-V Linux 用户程序 | 调用 Linux libc，运行在 Linux/QEMU user mode |
| `riscv64-unknown-elf-gcc` | 裸机 ELF | 固件、嵌入式程序；通常自行提供启动代码和链接脚本 |
| xv6 Makefile 配置的交叉 GCC | xv6 内核/用户程序 | 以项目指定的 `-march`、`-mabi` 构建课程代码 |

构建选项也需匹配：`-march` 选择 ISA/扩展，`-mabi` 选择 ABI。目标不支持的指令可能在运行时触发非法指令；ABI 不匹配则可能在参数、浮点值或数据布局上出错。

## 3. ELF 文件与常看 section

ELF（Executable and Linkable Format）是常见目标文件格式。**Section** 便于链接器和调试工具组织内容，**Segment** 描述装载时的内存映射；两者不是同一概念。

| Section | 常见内容 |
|---|---|
| `.text` | 机器指令 |
| `.rodata` | 字符串、只读常量 |
| `.data` | 有初始值的可写全局/静态数据 |
| `.bss` | 未显式初始化或零初始化的数据（文件中通常不存对应零字节） |
| `.symtab` / `.strtab` | 符号表和符号名；剥离后可能缺失 |
| `.debug_*` | 调试信息；是否存在取决于编译选项和剥离过程 |

常用检查命令：

~~~bash
file hello
riscv64-linux-gnu-readelf -h -l -S hello
riscv64-linux-gnu-nm hello
riscv64-linux-gnu-objdump -d -S hello
~~~

## 4. QEMU 的两种常见模式

| 模式 | 模拟什么 | 典型命令 | 适用场景 |
|---|---|---|---|
| User mode | 在宿主内核上运行目标架构的用户进程，并转换系统调用 | `qemu-riscv64 ./hello` | 测试 Linux 用户程序；需要目标动态库时提供 sysroot |
| System mode | 模拟 CPU、内存和机器设备，可启动固件/内核/磁盘镜像 | `qemu-system-riscv64 ...` | 启动 xv6、Linux 内核或裸机系统 |

`qemu-system-riscv64` 参数依赖具体 machine、固件、内核入口和镜像格式。不要把 user mode 当成完整硬件仿真，也不要期待裸机 ELF 自动获得 Linux 系统调用服务。

## 5. 调试和项目组织

常见 GDB 远程流程是让 QEMU 开启 GDB stub，再由交叉 GDB 连接；断点、寄存器、PC 和内存视图可帮助验证执行路径。对 xv6，可从仓库提供的 `make qemu-gdb` / Makefile 目标开始，并以该版本说明为准。

一个清楚的小项目可以按职责分文件：

```text
project/
├── src/        C 与汇编源码
├── include/    头文件
├── build/      对象文件和生成物
├── linker.ld   裸机链接脚本（需要时）
└── Makefile
```

> **核心结论：** 编译器目标、ISA 扩展、ABI、ELF 和运行环境必须一致；遇到“能编译但不能启动”，先逐项检查这条链路。

**下一篇：** [07 · xv6 源码分析](/risc-v-notes/risc-v-07-xv6-source-tour/) → [08 · xv6 启动流程](/risc-v-notes/risc-v-08-xv6-boot/)
