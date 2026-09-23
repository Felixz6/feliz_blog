---
title: "RISC-V 学习笔记：从机器指令到 xv6"
slug: risc-v-xv6-learning-notes
description: "从二进制与计算机组成出发，循序理解 RISC-V 指令、工具链与 xv6 内核；13 篇笔记串成一条从硬件模型到操作系统源码的学习路线。"
pubDate: 2026-09-23
updatedDate: 2026-09-23T17:01:00+08:00
cover: "/blog-covers/cover-11.webp"
tags: ["RISC-V","xv6","计算机组成","学习路线"]
category: "tech"
---

从数字表示、硬件组成到 RISC-V 汇编与 xv6 内核，这组笔记按“先建立模型，再看代码”的顺序整理。每章都包含核心结论、学习目标和可跟着源码或实验验证的内容。

## 学习路线

| 阶段 | 内容 | 读完后能做什么 |
|---|---|---|
| 01 · 入门 | [基础知识](/risc-v-notes/risc-v-00-basics/) → [计算机组成](/risc-v-notes/risc-v-01-computer-organization/) → [二进制与补码](/risc-v-notes/risc-v-02-binary-and-twos-complement/) | 解释程序如何变成机器指令、数据如何表示 |
| 02 · ISA | [寄存器](/risc-v-notes/risc-v-03-registers/) → [指令详解](/risc-v-notes/risc-v-04-instruction-reference/) → [汇编实验](/risc-v-notes/risc-v-05-assembly-lab/) | 阅读并调试简单汇编 |
| 03 · 工具链 | [GCC 与 QEMU](/risc-v-notes/risc-v-06-gcc-and-qemu/) | 编译、反汇编、运行和调试目标程序 |
| 04 · 操作系统 | [xv6 总览](/risc-v-notes/risc-v-07-xv6-source-tour/) → [启动](/risc-v-notes/risc-v-08-xv6-boot/) → [进程](/risc-v-notes/risc-v-09-xv6-process-management/) → [虚拟内存](/risc-v-notes/risc-v-10-xv6-virtual-memory/) → [系统调用与 Trap](/risc-v-notes/risc-v-11-xv6-syscalls-and-traps/) → [文件系统](/risc-v-notes/risc-v-12-xv6-filesystem/) | 沿着 xv6 源码追踪一次完整的内核路径 |

## 怎么使用

1. 顺序阅读；每章先看“核心结论”，再看示例和表格。
2. 把汇编例子放进自己的实验环境，使用反汇编和 GDB 验证，而不只背指令名称。
3. xv6 的实现细节会随课程分支变化。本文以 MIT 的 RISC-V xv6 及其配套教材为参照；遇到差异时，以手头 checkout 的源码为准。

## 参考资料

- [RISC-V 官方规格书库](https://docs.riscv.org/reference/home/index.html)：非特权指令集、特权架构及扩展的规范入口。
- [MIT xv6 RISC-V 教材](https://mit-pdos.github.io/xv6-riscv-book/)：按主题解释操作系统概念，并链接到源码。
- [MIT xv6-riscv 源码](https://github.com/mit-pdos/xv6-riscv)：将教材中的概念映射到实际实现。


[从第一章开始：RISC-V 基础知识 →](/risc-v-notes/risc-v-00-basics/)
