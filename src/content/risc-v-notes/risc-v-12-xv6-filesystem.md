---
title: "xv6 文件系统"
slug: risc-v-12-xv6-filesystem
description: "文件系统把路径名映射到 inode，再把文件偏移映射到磁盘块；缓存与日志负责高效访问和崩溃一致性。"
pubDate: 2026-09-23
cover: "/blog-covers/cover-11.webp"
tags: ["RISC-V","xv6","计算机系统","学习笔记"]
category: "tech"
---
> **一句话：** 文件系统把路径名映射到 inode，再把文件偏移映射到磁盘块；缓存与日志负责高效访问和崩溃一致性。

## 本章导航

[磁盘布局](#1-磁盘上的主要区域) · [inode 与目录](#2-inode-目录和数据块) · [文件描述符](#3-从路径到文件描述符) · [读写路径](#4-readwrite-如何到达磁盘) · [缓存与日志](#5-buffer-cache-与日志)

## 学习目标

- 区分目录项、inode、内存中的 file 对象和进程文件描述符。
- 追踪 open/read/write 的主要内核路径。
- 解释 buffer cache 和日志如何配合块设备访问。

## 1. 磁盘上的主要区域

xv6 文件系统镜像由若干区域组成，常见布局如下：

```text
Boot block | Superblock | Log | Inode blocks | Bitmap | Data blocks
```

- **Superblock：** 文件系统大小、inode/数据块数量以及日志等布局元数据。
- **Log：** 崩溃恢复使用的事务日志区域。
- **Inode blocks：** 磁盘 inode 表。
- **Bitmap：** 标记数据块分配情况。
- **Data blocks：** 目录内容和普通文件内容。

xv6 的文件系统块通常为 1024 字节。磁盘布局常量和具体镜像大小以 `kernel/fs.h`、`kernel/mkfs` 及当前构建配置为准。

## 2. inode、目录和数据块

磁盘 inode（xv6 中的 `struct dinode`）记录类型、链接计数、文件大小和数据块地址；它不保存文件名。MIT xv6 常见版本使用 12 个直接块地址和 1 个间接块地址（具体常量以源码为准）把文件偏移映射到块。数据块数超过直接范围时，要先通过间接块找到实际块号。

目录本身也是一种文件，其数据是**目录项**序列；每个目录项把名字与 inode 编号关联起来：

```text
"notes.txt" → directory entry (name, inum) → inode → data blocks
```

inode 编号标识文件对象；一个 inode 可通过多个硬链接名找到。目录查找、路径遍历和链接计数由内核维护。xv6 为教学而精简，没有完整的 POSIX 文件权限模型；其他现代文件系统功能也不能按 Linux 语义推断。

## 3. 从路径到文件描述符

用户执行 `open("a.txt", ...)` 后，系统调用路径大致为：

```text
用户 stub → syscall 分派 → sys_open
          → 路径查找/namei → inode 操作
          → 分配内核 file 对象 → 安装到进程 fd 表 → 返回 fd
```

文件描述符是进程文件表中的小整数索引。常见约定中 0、1、2 分别表示标准输入、标准输出、标准错误；新打开对象通常使用可用编号。fd 并不是磁盘 inode 号。

内核 `struct file` 保存打开实例的状态，例如偏移、读写能力和关联对象；多个 fd 通过 `dup` 或 `fork` 可能指向同一个打开实例。inode 是文件系统对象，两者生命周期和含义不同。

## 4. read/write 如何到达磁盘

读取路径可概括为：

```text
read(fd, user_buf, n)
 → sys_read / fileread
 → inode 读函数按 offset 查块
 → buffer cache 获取块
 → 必要时块设备读取
 → copyout 到用户缓冲区
```

写入路径类似：

```text
write(fd, user_buf, n)
 → sys_write / filewrite
 → copyin 用户数据
 → inode 写函数分块更新
 → buffer cache / 日志提交
 → 返回写入字节数或错误
```

真实路径包含锁、边界检查、文件偏移更新和错误处理；阅读时可从 `kernel/sysfile.c` 的系统调用入口往下追踪到 `kernel/file.c`、`kernel/fs.c`、`kernel/bio.c` 与设备驱动。

## 5. Buffer cache 与日志

Buffer cache 把磁盘块缓存在内存中，减少重复设备 I/O，并协调同一块的并发访问。命中时可直接复用已缓存数据；未命中时才需要设备读取。

文件系统修改可能跨多个块。若只写了一半就崩溃，inode、位图和目录内容可能彼此不一致。xv6 使用日志事务记录将要更新的块：

1. 文件系统操作加入事务；
2. 修改经 `log_write` 记录到缓存/日志缓冲；
3. 最后一个相关操作结束时提交日志头；
4. 将日志块安装到 home block，再清除日志头；
5. 重启时若发现已提交日志，按日志重放。

日志用于保证这类更新按事务语义恢复；它不等于用户可直接访问的普通文本日志，也不代表所有错误和硬件故障都能被掩盖。

> **核心结论：** 路径名经目录项找到 inode，fd 索引的是进程中的打开对象，inode 再把文件偏移映射到块；缓存与日志分别解决访问效率和更新一致性问题。

**下一步：** 回到 [学习索引](/risc-v-notes/risc-v-xv6-learning-notes/)，或对照 [MIT xv6 文件系统章节](https://mit-pdos.github.io/xv6-riscv-book/)逐项阅读源码。
