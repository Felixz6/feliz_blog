---
title: "RISC-V 汇编实验"
slug: risc-v-05-assembly-lab
description: "写一个遵循 RISC-V 调用约定的汇编函数，让 C 程序调用它；然后编译、运行、反汇编并用 GDB 查看执行状态。"
pubDate: 2026-09-23
cover: "/blog-covers/cover-11.webp"
tags: ["RISC-V","xv6","计算机系统","学习笔记"]
category: "tech"
---
> **实验目标：** 写一个遵循 RISC-V 调用约定的汇编函数，让 C 程序调用它；然后编译、运行、反汇编并用 GDB 查看执行状态。

## 本章导航

[工具链选择](#1-先选对工具链) · [编写程序](#2-写一个-c-加汇编的小程序) · [构建与运行](#3-编译运行和反汇编) · [GDB 调试](#4-用-gdb-观察状态) · [延伸实验](#5-继续练习)

## 1. 先选对工具链

| 用途 | 常见工具前缀 | 典型运行方式 |
|---|---|---|
| RISC-V Linux 应用 | `riscv64-linux-gnu-` | QEMU user mode 或真实 RISC-V Linux |
| 裸机/固件 | `riscv64-unknown-elf-` | 板级硬件或配置匹配的 QEMU system machine |
| xv6 教学内核 | xv6 仓库 Makefile 指定的编译器 | `make qemu` 启动整台模拟机器 |

先核对本机实际安装的命令和目标支持：

~~~bash
riscv64-linux-gnu-gcc --version
riscv64-linux-gnu-gcc -dumpmachine
qemu-riscv64 --version
~~~

工具前缀、模拟器和 ELF 的目标必须匹配；“有个 RISC-V GCC”并不自动意味着它能启动任意系统镜像。

## 2. 写一个 C 加汇编的小程序

在同一目录创建 `demo.c`：

~~~c
#include <stdio.h>

long add2(long x, long y);

int main(void) {
    printf("%ld\n", add2(19, 23));
    return 0;
}
~~~

再创建 `sum.S`：

~~~asm
    .text
    .globl add2
    .type add2, @function
add2:
    add a0, a0, a1      # 第 1、2 个整数参数在 a0、a1
    ret                 # 整数返回值留在 a0
~~~

这是一个叶函数：不再调用其他函数，因此不需要保存 ra 或建立栈帧。若函数会调用另一个函数且之后仍需返回，本函数通常要先保存自己的返回地址。

## 3. 编译、运行和反汇编

~~~bash
riscv64-linux-gnu-gcc -g -O0 -o demo demo.c sum.S
qemu-riscv64 -L /usr/riscv64-linux-gnu ./demo
riscv64-linux-gnu-objdump -d -S demo
~~~

成功运行时，程序输出：

~~~text
42
~~~

`-g` 加入调试信息，`-O0` 便于初学时把源码与汇编对应起来；优化等级会改变指令和寄存器使用。`-L` 指定目标程序运行时所需的 RISC-V 库目录，不同发行版路径可能不同。

只编译不链接也可单独检查汇编对象：

~~~bash
riscv64-linux-gnu-gcc -g -c sum.S -o sum.o
riscv64-linux-gnu-objdump -dr sum.o
riscv64-linux-gnu-readelf -h -S demo
~~~

## 4. 用 GDB 观察状态

终端 A 启动带 GDB stub 的 QEMU user-mode 程序：

~~~bash
qemu-riscv64 -g 1234 -L /usr/riscv64-linux-gnu ./demo
~~~

终端 B 连接调试器：

~~~bash
riscv64-linux-gnu-gdb ./demo
~~~

~~~text
(gdb) target remote :1234
(gdb) break add2
(gdb) continue
(gdb) info registers a0 a1 pc sp ra
(gdb) x/4i $pc
(gdb) stepi
(gdb) info registers a0
~~~

在断点处，检查 a0 与 a1 是否分别是 19、23；单步执行 `add` 后，a0 应变成 42。此验证把 ABI 约定、指令语义和真实执行状态连起来。

## 5. 继续练习

- [ ] 把 `add` 改成 `sub`，修改 C 端输入并预测结果。
- [ ] 在 C 中调用两次 `add2`，观察返回值和 ra。
- [ ] 加一个非叶汇编函数，在调用其他函数前保存 ra，并确认栈对齐。
- [ ] 用 `-O2` 重编译，对比优化前后的反汇编。
- [ ] 在调试器中查看 `sp` 附近内存：`x/8gx $sp`（RV64）。

> **常见故障排查：** `Exec format error` 通常表示运行器/二进制目标不匹配；共享库错误时检查 QEMU 的 `-L` 路径；断点或符号缺失时确认使用了 `-g`，并给 GDB 传入正确 ELF。

**下一篇：** [06 · GCC 与 QEMU 环境](/risc-v-notes/risc-v-06-gcc-and-qemu/) → [07 · xv6 源码分析](/risc-v-notes/risc-v-07-xv6-source-tour/)
