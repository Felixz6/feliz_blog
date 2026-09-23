---
title: "硬件设计基础三实验报告"
description: "整理全加器、比较器、计数器、流水灯与数码管时钟的 Multisim / Verilog 实验原理、代码、仿真和上板结果。"
pubDate: 2026-06-07
updatedDate: 2026-06-07
cover: "/blog-covers/cover-09.webp"
tags: ["硬件设计", "Multisim", "Verilog", "FPGA"]
category: "tech"
---

## 第1题：用 Multisim 设计全加器

### 一、实验要求

- 给出 1 位全加器逻辑表达式。

- 截图保存 Multisim 电路图。

- 拍摄开发板运行结果照片。

### 二、实验原理

1 位全加器有三个输入 A、B、Cin，两个输出 Sum 和 Cout。其中 Sum 表示本位和，Cout 表示向高位产生的进位。

逻辑表达式：Sum = A ⊕ B ⊕ Cin；Cout = AB + ACin + BCin。根据表达式可使用两个异或门得到 Sum，用三个与门和两个或门组合得到 Cout。

### 三、电路截图与运行照片

![图 1](/blog-content/hardware-design-fundamentals-3/images/fig_001.png)

图 1-1 1 位全加器 Multisim 门级电路截图

![图 2](/blog-content/hardware-design-fundamentals-3/images/fig_002.png)

图 1-2 运行照片：典型输入组合 1

![图 3](/blog-content/hardware-design-fundamentals-3/images/fig_003.png)

图 1-3 运行照片：典型输入组合 2

### 四、实验结果与分析

| **A** | **B** | **Cin** | **Sum** | **Cout** |
|-------|-------|---------|---------|----------|
| 0     | 0     | 0       | 0       | 0        |
| 0     | 0     | 1       | 1       | 0        |
| 0     | 1     | 0       | 1       | 0        |
| 0     | 1     | 1       | 0       | 1        |
| 1     | 0     | 0       | 1       | 0        |
| 1     | 0     | 1       | 0       | 1        |
| 1     | 1     | 0       | 0       | 1        |
| 1     | 1     | 1       | 1       | 1        |

  


照片中的 LED 输出与真值表一致：当三个输入中有奇数个 1 时 Sum 为 1；当至少两个输入为 1 时 Cout 为 1，说明电路连线与逻辑表达式正确。

  


## 第2题：用 Multisim 将 4 位比较器扩展为 8 位

### 一、实验要求

- 给出 8 位相等比较逻辑表达式。

- 截图保存 4 位比较器级联电路。

- 拍摄开发板运行结果照片。

### 二、实验原理

8 位比较器重点验证 A\[7:0\] 与 B\[7:0\] 是否相等。只有 8 个对应位全部相同，EQ 输出才为 1；任意一位不同，EQ 均为 0。

相等判断可写为 EQ=(A7≡B7)(A6≡B6)(A5≡B5)(A4≡B4)(A3≡B3)(A2≡B2)(A1≡B1)(A0≡B0)。若采用两个 4 位比较器级联，则 EQ = Eh·El，其中 Eh 为高 4 位相等输出，El 为低 4 位相等输出。

### 三、电路截图与运行照片

![图 4](/blog-content/hardware-design-fundamentals-3/images/fig_004.png)

图 2-1 8 位比较器级联电路截图

![图 5](/blog-content/hardware-design-fundamentals-3/images/fig_005.jpg)

图 2-2 运行照片 1

![图 6](/blog-content/hardware-design-fundamentals-3/images/fig_006.jpg)

图 2-3 运行照片 2

![图 7](/blog-content/hardware-design-fundamentals-3/images/fig_007.jpg)

图 2-4 运行照片 3

### 四、实验结果与分析

| **A(十六进制)** | **B(十六进制)** | **EQ(A=B)** | **分析**                 |
|-----------------|-----------------|-------------|--------------------------|
| 8A              | 79              | 0           | 高 4 位 8≠7，不相等      |
| 3C              | 3C              | 1           | 高低 4 位均相等          |
| 25              | 2A              | 0           | 高 4 位相等，低 4 位 5≠A |
| F0              | 0F              | 0           | 高 4 位 F≠0，不相等      |

  


从上板照片可以看出，当高、低 4 位均相等时相等输出有效；只要高位或低位存在差异，相等指示灯保持无效，符合 8 位相等比较器的设计要求。

  


## 第3题：用 Multisim 设计可调频率计数器

### 一、实验要求

- 通过拨码开关或选择线路实现频率降低 2 倍、降低 4 倍、提高 2 倍、提高 4 倍。

- 给出调整线路的原理。

- 截图保存电路图并拍摄运行结果。

### 二、实验原理

二进制计数器中，最低位 Q0 每两个时钟周期翻转一次，因此 Q0 频率为输入时钟 f 的 1/2；Q1 为 f/4；Q2 为 f/8；Q3 为 f/16。若以 Q2 作为基准输出，则选择 Q1 可提高 2 倍，选择 Q0 可提高 4 倍，选择 Q3 可降低 2 倍，选择级联后的 Q4 可降低 4 倍。

本题照片中各档位主要通过数码管显示变化快慢进行验证。观察时应确认选择线路只改变输出观察端或计数使能频率，不应破坏计数链本身的二进制递增顺序。

### 三、电路截图与运行照片

![图 8](/blog-content/hardware-design-fundamentals-3/images/fig_008.png)

图 3-1 基准/选择线路电路图

![图 9](/blog-content/hardware-design-fundamentals-3/images/fig_009.jpg)

图 3-2 基准或慢速档运行照片

![图 10](/blog-content/hardware-design-fundamentals-3/images/fig_010.png)

图 3-3 频率调整电路图 1

![图 11](/blog-content/hardware-design-fundamentals-3/images/fig_011.jpg)

图 3-4 运行照片 1

![图 12](/blog-content/hardware-design-fundamentals-3/images/fig_012.png)

图 3-5 频率调整电路图 2

![图 13](/blog-content/hardware-design-fundamentals-3/images/fig_013.jpg)

图 3-6 运行照片 2

![图 14](/blog-content/hardware-design-fundamentals-3/images/fig_014.png)

图 3-7 频率调整电路图 3

![图 15](/blog-content/hardware-design-fundamentals-3/images/fig_015.jpg)

图 3-8 运行照片 3

![图 16](/blog-content/hardware-design-fundamentals-3/images/fig_016.png)

图 3-9 频率调整电路图 4

![图 17](/blog-content/hardware-design-fundamentals-3/images/fig_017.jpg)

图 3-10 运行照片 4

### 四、实验结果与分析

| **输出端** | **频率** | **相对** **Q2** **的变化** | **用途**          |
|------------|----------|----------------------------|-------------------|
| Q0         | f/2      | 提高 4 倍                  | 较快闪烁/高频观察 |
| Q1         | f/4      | 提高 2 倍                  | 较快计数          |
| Q2         | f/8      | 参考频率                   | 基准输出          |
| Q3         | f/16     | 降低 2 倍                  | 较慢计数          |
| Q4(扩展后) | f/32     | 降低 4 倍                  | 更慢计数          |

  


根据电路图和运行照片，不同档位下数码管变化速度存在明显差异，符合从计数器不同位选取输出所形成的固定倍数分频关系。

  


## 第4题：用 Multisim 将 4 位计数器扩展到 8 位并实现频率选择

### 一、实验要求

- 将 4 位计数器扩展为 8 位计数器。

- 使用两个拨码开关完成频率选择，包含频率提高 5 倍和提高 10 倍/或实验电路中的多档提频验证。

- 拍摄 10 秒视频，并在 4 秒、6 秒、8 秒截屏，结果进位到千位即可。

### 二、实验原理

4 位计数器扩展到 8 位计数器时，低 4 位计数器产生终端计数/进位信号，作为高 4 位计数器的计数使能。当低 4 位从 1111 回到 0000 时，高 4 位加 1。

两个拨码开关 SW1、SW0 可形成 00、01、10、11 四种选择状态。实验电路中通过多路选择器选择不同计数或时钟路径，使数码管显示按不同速度递增。若以 1 倍速度为参考，视频中 4 秒、6 秒、8 秒的计数值应呈线性增加。

### 三、电路截图与视频截屏

![图 18](/blog-content/hardware-design-fundamentals-3/images/fig_018.png)

图 4-1 8 位计数器扩展与 MUX 频率选择电路截图

![图 19](/blog-content/hardware-design-fundamentals-3/images/fig_019.png)

图 4-2 数码管显示与计数扩展电路总图

![图 20](/blog-content/hardware-design-fundamentals-3/images/fig_020.jpg)

图 4-3 视频截屏：4 秒附近

![图 21](/blog-content/hardware-design-fundamentals-3/images/fig_021.jpg)

图 4-4 视频截屏：6 秒附近

![图 22](/blog-content/hardware-design-fundamentals-3/images/fig_022.jpg)

图 4-5 视频截屏：8 秒附近

### 四、实验结果与分析

| **SW1** | **SW0** | **选择模式** | **4** **秒** | **6** **秒** | **8** **秒** | **结果分析**         |
|---------|---------|--------------|--------------|--------------|--------------|----------------------|
| 0       | 0       | 1 倍         | 0004         | 0006         | 0008         | 每秒加 1             |
| 0       | 1       | 2 倍         | 0008         | 0012         | 0016         | 每秒加 2，作为中间档 |
| 1       | 0       | 8 倍         | 0032         | 0048         | 0064         | 满足高倍频观察要求   |
| 1       | 1       | 16 倍        | 0064         | 0096         | 0128         | 高速档，显示增长最快 |

  


从 4 秒、6 秒、8 秒截图可以比较出显示值随时间增加的规律。实际照片可能受启动时刻、视频截帧位置或拨码切换延迟影响，与理论值允许存在 1 个计数以内偏差，但整体速度档位应保持一致。

  


## 第5题：使用 Verilog 实现 4 位比较器、8 位比较器和 8 位串行进位加法器

### 一、实验要求

- 按照参考资料布置引脚关联。

- 模块名和变量名按参考资料要求。

- 8 位比较器由两个 4 位比较器实例化组成；8 位串行进位加法器由 8 个全加器实例化组成。

- 给出实验原理、代码、仿真/资源截图和典型上板照片。

### 二、实验原理

4 位比较器直接比较 A\[3:0\] 与 B\[3:0\]，输出 A\>B、A=B、A\<B。8 位比较器由高 4 位比较器和低 4 位比较器级联构成，高 4 位比较结果优先；只有高 4 位相等时，低 4 位结果才参与最终判断。

8 位串行进位加法器由 8 个 1 位全加器串联构成，第 i 位全加器的 Cout 接到第 i+1 位全加器的 Cin。该结构能直观体现进位从低位向高位传递的过程。

### 三、Verilog 代码

#### （一）4 位比较器

``` verilog
 `timescale 1ns/1ps

 module comp4(
 input wire [3:0] A,
 input wire [3:0] B,
 output wire       AGTB,
 output wire       AEQB,
 output wire       ALTB
 );
 assign AGTB = (A > B);
 assign AEQB = (A == B);
 assign ALTB = (A < B);
 endmodule

 module exp2_1_top(
 input wire [3:0] A,
 input wire [3:0] B,
 output wire       AGTB,
 output wire       AEQB,
 output wire       ALTB
 );
 comp4 u_comp4(.A(A), .B(B), .AGTB(AGTB), .AEQB(AEQB), .ALTB(ALTB));
 endmodule
```

  


#### （二）8 位比较器

``` verilog
 `timescale 1ns/1ps

 module comp8(
 input wire [7:0] A,
 input wire [7:0] B,
 output wire       AGTB,
 output wire       AEQB,
 output wire       ALTB
 );
 wire gt_h, eq_h, lt_h;
 wire gt_l, eq_l, lt_l;

 comp4 u_high(.A(A[7:4]), .B(B[7:4]), .AGTB(gt_h), .AEQB(eq_h), .ALTB(lt_h));
 comp4 u_low (.A(A[3:0]), .B(B[3:0]), .AGTB(gt_l), .AEQB(eq_l), .ALTB(lt_l));

 assign AGTB = gt_h | (eq_h & gt_l);
 assign AEQB = eq_h & eq_l;
 assign ALTB = lt_h | (eq_h & lt_l);
 endmodule

 module exp2_2_top(
 input wire [7:0] A,
 input wire [7:0] B,
 output wire       AGTB,
 output wire       AEQB,
 output wire       ALTB
 );
 comp8 u_comp8(.A(A), .B(B), .AGTB(AGTB), .AEQB(AEQB), .ALTB(ALTB));
 endmodule
```

  


#### （三）8 位串行进位加法器

``` verilog
 `timescale 1ns/1ps

 module full_adder(
 input wire A,
 input wire B,
 input wire Cin,
 output wire S,
 output wire Cout
 );
 assign S    = A ^ B ^ Cin;
 assign Cout = (A & B) | (A & Cin) | (B & Cin);
 endmodule

 module add8_serial_carry(
 input wire [7:0] A,
 input wire [7:0] B,
 input wire       Cin,
 output wire [7:0] S,
 output wire       Cout
 );
 wire [8:0] c;
 assign c[0] = Cin;
 assign Cout = c[8];

 full_adder u0(.A(A[0]), .B(B[0]), .Cin(c[0]), .S(S[0]), .Cout(c[1]));
 full_adder u1(.A(A[1]), .B(B[1]), .Cin(c[1]), .S(S[1]), .Cout(c[2]));
 full_adder u2(.A(A[2]), .B(B[2]), .Cin(c[2]), .S(S[2]), .Cout(c[3]));
 full_adder u3(.A(A[3]), .B(B[3]), .Cin(c[3]), .S(S[3]), .Cout(c[4]));
 full_adder u4(.A(A[4]), .B(B[4]), .Cin(c[4]), .S(S[4]), .Cout(c[5]));
 full_adder u5(.A(A[5]), .B(B[5]), .Cin(c[5]), .S(S[5]), .Cout(c[6]));
 full_adder u6(.A(A[6]), .B(B[6]), .Cin(c[6]), .S(S[6]), .Cout(c[7]));
 full_adder u7(.A(A[7]), .B(B[7]), .Cin(c[7]), .S(S[7]), .Cout(c[8]));
 endmodule

 module exp2_3_top(
 input wire [7:0] A,
 input wire [7:0] B,
 input wire       Cin,
 output wire [7:0] S,
 output wire       Cout
 );
 add8_serial_carry u_add8(.A(A), .B(B), .Cin(Cin), .S(S), .Cout(Cout));
 endmodule
```

  


### 四、截图与照片整理

![图 23](/blog-content/hardware-design-fundamentals-3/images/fig_023.png)

图 5-1 4 位比较器 RTL 结构图

![图 24](/blog-content/hardware-design-fundamentals-3/images/fig_024.png)

图 5-2 4 位比较器资源开销

![图 25](/blog-content/hardware-design-fundamentals-3/images/fig_025.png)

图 5-3 4 位比较器仿真波形

![图 26](/blog-content/hardware-design-fundamentals-3/images/fig_026.jpg)

图 5-4 4 位比较器上板照片 1

![图 27](/blog-content/hardware-design-fundamentals-3/images/fig_027.jpg)

图 5-5 4 位比较器上板照片 2

![图 28](/blog-content/hardware-design-fundamentals-3/images/fig_028.jpg)

图 5-6 4 位比较器上板照片 3

![图 29](/blog-content/hardware-design-fundamentals-3/images/fig_029.png)

图 5-7 8 位比较器综合结构图

![图 30](/blog-content/hardware-design-fundamentals-3/images/fig_030.png)

图 5-8 8 位比较器资源开销

![图 31](/blog-content/hardware-design-fundamentals-3/images/fig_031.png)

图 5-9 8 位比较器仿真波形

![图 32](/blog-content/hardware-design-fundamentals-3/images/fig_032.jpg)

图 5-10 8 位比较器上板照片 1

![图 33](/blog-content/hardware-design-fundamentals-3/images/fig_033.jpg)

图 5-11 8 位比较器上板照片 2

![图 34](/blog-content/hardware-design-fundamentals-3/images/fig_034.jpg)

图 5-12 8 位比较器上板照片 3

![图 35](/blog-content/hardware-design-fundamentals-3/images/fig_035.png)

图 5-13 8 位加法器 RTL 结构图

![图 36](/blog-content/hardware-design-fundamentals-3/images/fig_036.png)

图 5-14 8 位加法器资源开销

![图 37](/blog-content/hardware-design-fundamentals-3/images/fig_037.png)

图 5-15 8 位加法器仿真波形

![图 38](/blog-content/hardware-design-fundamentals-3/images/fig_038.jpg)

图 5-16 8 位加法器上板照片 1

![图 39](/blog-content/hardware-design-fundamentals-3/images/fig_039.jpg)

图 5-17 8 位加法器上板照片 2

![图 40](/blog-content/hardware-design-fundamentals-3/images/fig_040.jpg)

图 5-18 8 位加法器上板照片 3

### 五、实验结果与分析

| **模块**           | **Slice LUTs** | **Bonded IOB** | **说明**                            |
|--------------------|----------------|----------------|-------------------------------------|
| 4 位比较器         | 5              | 11             | 组合比较逻辑资源开销较小            |
| 8 位比较器         | 10             | 19             | 由两个 comp4 级联，资源随位宽增加   |
| 8 位串行进位加法器 | 8              | 26             | 包含 8 位输入、8 位和输出及最高进位 |

  


| **测试对象** | **典型输入**            | **预期输出**    | **结论**               |
|--------------|-------------------------|-----------------|------------------------|
| 4 位比较器   | A=4'hA，B=4'hA          | AEQB=1          | 相等比较正确           |
| 8 位比较器   | A=8'h2A，B=8'h25        | AGTB=1          | 高位相等时低位决定结果 |
| 8 位加法器   | A=8'h55，B=8'h55，Cin=1 | S=8'hAB，Cout=0 | 进位链工作正确         |

  


截图显示三个模块均完成综合并产生对应 RTL 结构；仿真波形和上板照片共同验证比较输出、加法结果和最高进位均符合设计预期。

  


## 第6题：使用 Verilog 实现模 8 计数器和分频器

### 一、实验要求

- 按照参考资料布置引脚关联。

- 给出次态真值表和 JK 触发器激励函数。

- 采用实例化 JK 触发器的方法实现模 8 计数器。

- 分频器用两个拨码开关实现频率切换，输出增加十进制数码管显示。

### 二、实验原理

JK 触发器在 J=K=1 时翻转，因此可用作 T 触发器。模 8 同步计数器需要 3 个触发器，状态按 000→001→010→011→100→101→110→111→000 循环。

由同步二进制计数规律可得激励函数：J0=K0=1，J1=K1=Q0，J2=K2=Q1Q0。若增加计数使能 en，则各激励函数需与 en 相与。

| **现态** **Q2Q1Q0** | **次态** **Q2+Q1+Q0+** | **T2=J2=K2** | **T1=J1=K1** | **T0=J0=K0** |
|---------------------|------------------------|--------------|--------------|--------------|
| 000                 | 001                    | 0            | 0            | 1            |
| 001                 | 010                    | 0            | 1            | 1            |
| 010                 | 011                    | 0            | 0            | 1            |
| 011                 | 100                    | 1            | 1            | 1            |
| 100                 | 101                    | 0            | 0            | 1            |
| 101                 | 110                    | 0            | 1            | 1            |
| 110                 | 111                    | 0            | 0            | 1            |
| 111                 | 000                    | 1            | 1            | 1            |

  


### 三、Verilog 代码

``` verilog
 `timescale 1ns/1ps

 module jk_ff(
 input wire clk,
 input wire rst_n,
 input wire J,
 input wire K,
 output reg  Q
 );
 always @(posedge clk or negedge rst_n) begin
 if (!rst_n) Q <= 1'b0;
 else begin
 case ({J, K})
 2'b00: Q <= Q;
 2'b01: Q <= 1'b0;
 2'b10: Q <= 1'b1;
 2'b11: Q <= ~Q;
 endcase
 end
 end
 endmodule

 module mod8_counter_jk(
 input wire clk,
 input wire rst_n,
 input wire en,
 output wire [2:0] Q
 );
 wire j0 = en;
 wire k0 = en;
 wire j1 = en & Q[0];
 wire k1 = en & Q[0];
 wire j2 = en & Q[1] & Q[0];
 wire k2 = en & Q[1] & Q[0];

 jk_ff u0(.clk(clk), .rst_n(rst_n), .J(j0), .K(k0), .Q(Q[0]));
 jk_ff u1(.clk(clk), .rst_n(rst_n), .J(j1), .K(k1), .Q(Q[1]));
 jk_ff u2(.clk(clk), .rst_n(rst_n), .J(j2), .K(k2), .Q(Q[2]));
 endmodule

 module divider_tick #(parameter integer CLK_FREQ = 100_000_000)(
 input wire clk,
 input wire rst_n,
 input wire [1:0] sw,
 output reg  tick
 );
 reg [31:0] cnt;
 reg [31:0] limit;

 always @(*) begin
 case (sw)
 2'b00: limit = CLK_FREQ;
 2'b01: limit = CLK_FREQ / 2;
 2'b10: limit = CLK_FREQ / 4;
 default: limit = CLK_FREQ / 8;
 endcase
 end

 always @(posedge clk or negedge rst_n) begin
 if (!rst_n) begin
 cnt <= 32'd0; tick <= 1'b0;
 end else if (cnt >= limit - 1) begin
 cnt <= 32'd0; tick <= 1'b1;
 end else begin
 cnt <= cnt + 32'd1; tick <= 1'b0;
 end
 end
 endmodule

 module seg7_decimal(input wire [3:0] num, output reg [7:0] seg);
 always @(*) begin
 case (num)
 4'd0: seg = 8'b1100_0000; 4'd1: seg = 8'b1111_1001;
 4'd2: seg = 8'b1010_0100; 4'd3: seg = 8'b1011_0000;
 4'd4: seg = 8'b1001_1001; 4'd5: seg = 8'b1001_0010;
 4'd6: seg = 8'b1000_0010; 4'd7: seg = 8'b1111_1000;
 default: seg = 8'b1111_1111;
 endcase
 end
 endmodule

 module exp3_top #(parameter integer CLK_FREQ = 100_000_000)(
 input wire       clk,
 input wire       reset,
 input wire [1:0] sw,
 output wire [2:0] count,
 output wire [7:0] seg,
 output wire [7:0] an
 );
 wire rst_n = ~reset;
 wire tick;
 divider_tick #(.CLK_FREQ(CLK_FREQ)) u_div(.clk(clk), .rst_n(rst_n), .sw(sw), .tick(tick));
 mod8_counter_jk u_cnt(.clk(clk), .rst_n(rst_n), .en(tick), .Q(count));
 seg7_decimal u_seg(.num({1'b0, count}), .seg(seg));
 assign an = 8'b1111_1110;
 endmodule
```

  


### 四、截图与照片整理

![图 41](/blog-content/hardware-design-fundamentals-3/images/fig_041.png)

图 6-1 模 8 计数器/分频器 RTL 结构

![图 42](/blog-content/hardware-design-fundamentals-3/images/fig_042.png)

图 6-2 资源开销截图

![图 43](/blog-content/hardware-design-fundamentals-3/images/fig_043.png)

图 6-3 仿真波形截图

![图 44](/blog-content/hardware-design-fundamentals-3/images/fig_044.jpg)

图 6-4 上板照片 1

![图 45](/blog-content/hardware-design-fundamentals-3/images/fig_045.jpg)

图 6-5 上板照片 2

![图 46](/blog-content/hardware-design-fundamentals-3/images/fig_046.jpg)

图 6-6 上板照片 3

![图 47](/blog-content/hardware-design-fundamentals-3/images/fig_047.jpg)

图 6-7 上板照片 4

### 五、实验结果与分析

| **拨码开关** **sw** | **计数速度** | **数码管现象**     | **分析**                     |
|---------------------|--------------|--------------------|------------------------------|
| 00                  | 约 1Hz       | 0、1、2、…、7 循环 | 便于肉眼观察                 |
| 01                  | 约 2Hz       | 循环速度加快       | 分频系数减小                 |
| 10                  | 约 4Hz       | 快速循环           | 计数使能频率提高             |
| 11                  | 约 8Hz       | 更快循环           | 显示稳定性依赖扫描与板卡响应 |

  


资源截图显示该设计主要资源消耗来自分频计数器，模 8 计数器本身只需 3 个触发器。照片中的数码管数值随拨码状态变化而呈现不同递增速度，说明分频切换逻辑有效。

  


## 第7题：使用 Verilog 实现基于状态机的 LED 流水灯控制

### 一、实验要求

- 实现 Gray 编码和 One-hot 编码两种状态机。

- 使用拨码开关作为输入，改变流水灯方向。

- 给出实验原理、代码和典型照片。

### 二、实验原理

有限状态机由当前状态、输入、状态转移逻辑和输出逻辑组成。本实验中的 LED 流水灯属于 Moore 型状态机，LED 输出主要由当前状态决定。

Gray 编码的相邻状态只有 1 位发生变化，可减少状态切换毛刺；One-hot 编码用一个触发器表示一个状态，译码简单，适合状态数不多的流水灯设计。dir_sw 用于选择正向或反向流水，mode_sw 用于选择 Gray 或 One-hot 模式。

### 三、Verilog 代码

``` verilog
 `timescale 1ns/1ps

 module fsm_tick #(parameter integer DIV = 25_000_000)(
 input wire clk,
 input wire rst_n,
 output reg  tick
 );
 reg [31:0] cnt;
 always @(posedge clk or negedge rst_n) begin
 if (!rst_n) begin cnt <= 32'd0; tick <= 1'b0; end
 else if (cnt >= DIV - 1) begin cnt <= 32'd0; tick <= 1'b1; end
 else begin cnt <= cnt + 32'd1; tick <= 1'b0; end
 end
 endmodule

 module gray_flow_fsm(
 input wire clk,
 input wire rst_n,
 input wire tick,
 input wire dir,
 output reg  [7:0] led,
 output reg  [2:0] state
 );
 reg [2:0] next_state;

 always @(*) begin
 if (!dir) begin
 case (state)
 3'b000: next_state = 3'b001;
 3'b001: next_state = 3'b011;
 3'b011: next_state = 3'b010;
 3'b010: next_state = 3'b110;
 3'b110: next_state = 3'b111;
 3'b111: next_state = 3'b101;
 3'b101: next_state = 3'b100;
 default: next_state = 3'b000;
 endcase
 end else begin
 case (state)
 3'b000: next_state = 3'b100;
 3'b100: next_state = 3'b101;
 3'b101: next_state = 3'b111;
 3'b111: next_state = 3'b110;
 3'b110: next_state = 3'b010;
 3'b010: next_state = 3'b011;
 3'b011: next_state = 3'b001;
 default: next_state = 3'b000;
 endcase
 end
 end

 always @(posedge clk or negedge rst_n) begin
 if (!rst_n) state <= 3'b000;
 else if (tick) state <= next_state;
 end

 always @(*) begin
 case (state)
 3'b000: led = 8'b0000_0001; 3'b001: led = 8'b0000_0010;
 3'b011: led = 8'b0000_0100; 3'b010: led = 8'b0000_1000;
 3'b110: led = 8'b0001_0000; 3'b111: led = 8'b0010_0000;
 3'b101: led = 8'b0100_0000; default: led = 8'b1000_0000;
 endcase
 end
 endmodule

 module onehot_flow_fsm(
 input wire clk,
 input wire rst_n,
 input wire tick,
 input wire dir,
 output reg  [7:0] led
 );
 always @(posedge clk or negedge rst_n) begin
 if (!rst_n) led <= 8'b0000_0001;
 else if (tick) begin
 if (!dir) led <= {led[6:0], led[7]};
 else led <= {led[0], led[7:1]};
 end
 end
 endmodule

 module exp6_top #(parameter integer DIV = 25_000_000)(
 input wire       clk,
 input wire       reset,
 input wire       dir_sw,
 input wire       mode_sw,
 output wire [7:0] led,
 output wire [7:0] seg,
 output wire [7:0] an
 );
 wire rst_n = ~reset;
 wire tick;
 wire [7:0] led_gray, led_onehot;
 wire [2:0] gray_state;

 fsm_tick #(.DIV(DIV)) u_tick(.clk(clk), .rst_n(rst_n), .tick(tick));
 gray_flow_fsm u_gray(.clk(clk), .rst_n(rst_n), .tick(tick), .dir(dir_sw), .led(led_gray), .state(gray_state));
 onehot_flow_fsm u_onehot(.clk(clk), .rst_n(rst_n), .tick(tick), .dir(dir_sw), .led(led_onehot));

 assign led = mode_sw ? led_onehot : led_gray;
 assign seg = 8'b1111_1111;
 assign an  = 8'b1111_1111;
 endmodule
```

  


### 四、截图与照片整理

![图 48](/blog-content/hardware-design-fundamentals-3/images/fig_048.png)

图 7-1 状态机 RTL 结构图

![图 49](/blog-content/hardware-design-fundamentals-3/images/fig_049.png)

图 7-2 资源开销截图

![图 50](/blog-content/hardware-design-fundamentals-3/images/fig_050.png)

图 7-3 仿真波形截图

![图 51](/blog-content/hardware-design-fundamentals-3/images/fig_051.jpg)

图 7-4 Gray/正向照片 1

![图 52](/blog-content/hardware-design-fundamentals-3/images/fig_052.jpg)

图 7-5 Gray/正向照片 2

![图 53](/blog-content/hardware-design-fundamentals-3/images/fig_053.jpg)

图 7-6 Gray/反向照片 1

![图 54](/blog-content/hardware-design-fundamentals-3/images/fig_054.jpg)

图 7-7 Gray/反向照片 2

![图 55](/blog-content/hardware-design-fundamentals-3/images/fig_055.jpg)

图 7-8 One-hot/正向照片 1

![图 56](/blog-content/hardware-design-fundamentals-3/images/fig_056.jpg)

图 7-9 One-hot/正向照片 2

![图 57](/blog-content/hardware-design-fundamentals-3/images/fig_057.jpg)

图 7-10 One-hot/反向照片 1

![图 58](/blog-content/hardware-design-fundamentals-3/images/fig_058.jpg)

图 7-11 One-hot/反向照片 2

### 五、实验结果与分析

| **mode_sw** | **dir_sw** | **LED** **变化方向** | **状态编码** | **结论**     |
|-------------|------------|----------------------|--------------|--------------|
| 0           | 0          | LED0→LED7            | Gray         | 正向流水正常 |
| 0           | 1          | LED7→LED0            | Gray         | 反向流水正常 |
| 1           | 0          | LED0→LED7            | One-hot      | 正向流水正常 |
| 1           | 1          | LED7→LED0            | One-hot      | 反向流水正常 |

  


资源开销截图显示 Gray 和 One-hot 两种状态机均已综合到顶层。仿真波形用于确认方向输入与模式输入对状态转移的影响；多张开发板照片证明 LED 能在不同编码和方向设置下按预期流水。

  


## 第8题：使用 Verilog 实现数码管动态显示数字时钟（时：分：秒）

### 一、实验要求

- 实现时：分：秒（HH:MM:SS）的数码管动态显示。

- 可通过拨码开关加快时钟，便于观察进位。

- 给出实验原理、代码、RTL 图、资源开销截图和典型运行照片。

### 二、实验原理

数字时钟由小时、分钟、秒三个计数单元组成。秒个位 0~9 计数，秒十位 0~5 计数；秒满 59 后分钟加 1；分钟满 59 后小时加 1；小时满 23 后回到 00。

数码管动态显示采用“位选 + 段选”的方式。某一瞬间只点亮一位数码管，但扫描频率足够高时，利用视觉暂留即可形成多位同时显示的效果。fast_sw 置 1 时，将计时脉冲由 1Hz 提高到较高频率，便于观察 59 秒、59 分和 23 时的进位回零。

### 三、Verilog 代码

``` verilog
 `timescale 1ns/1ps

 module clock_top #(
 parameter integer CLK_FREQ = 100_000_000,
 parameter integer FAST_HZ  = 100
 )(
 input wire       clk,
 input wire       reset,
 input wire       fast_sw,
 output reg  [7:0] seg,
 output reg  [7:0] an
 );
 wire rst_n = ~reset;

 reg [31:0] tick_cnt;
 reg tick_1s;
 wire [31:0] tick_limit = fast_sw ? (CLK_FREQ / FAST_HZ) : CLK_FREQ;

 // 计时脉冲：正常 1Hz，加速模式 FAST_HZ
 always @(posedge clk or negedge rst_n) begin
 if (!rst_n) begin
 tick_cnt <= 32'd0;
 tick_1s <= 1'b0;
 end else if (tick_cnt >= tick_limit - 1) begin
 tick_cnt <= 32'd0;
 tick_1s <= 1'b1;
 end else begin
 tick_cnt <= tick_cnt + 32'd1;
 tick_1s <= 1'b0;
 end
 end

 reg [3:0] sec_u, sec_t;
 reg [3:0] min_u, min_t;
 reg [3:0] hour_u, hour_t;

 // BCD 计数：HH:MM:SS，范围 00:00:00 ~ 23:59:59
 always @(posedge clk or negedge rst_n) begin
 if (!rst_n) begin
 sec_u <= 4'd0; sec_t  <= 4'd0;
 min_u <= 4'd0; min_t  <= 4'd0;
 hour_u <= 4'd0; hour_t <= 4'd0;
 end else if (tick_1s) begin
 if (sec_u != 4'd9) begin
 sec_u <= sec_u + 4'd1;
 end else begin
 sec_u <= 4'd0;
 if (sec_t != 4'd5) begin
 sec_t <= sec_t + 4'd1;
 end else begin
 sec_t <= 4'd0;
 if (min_u != 4'd9) begin
 min_u <= min_u + 4'd1;
 end else begin
 min_u <= 4'd0;
 if (min_t != 4'd5) begin
 min_t <= min_t + 4'd1;
 end else begin
 min_t <= 4'd0;
 if (hour_t == 4'd2 && hour_u == 4'd3) begin
 hour_t <= 4'd0; hour_u <= 4'd0;
 end else if (hour_u != 4'd9) begin
 hour_u <= hour_u + 4'd1;
 end else begin
 hour_u <= 4'd0; hour_t <= hour_t + 4'd1;
 end
 end
 end
 end
 end
 end
 end

 // 动态扫描分频，约 1 kHz 以上即可稳定显示
 reg [16:0] scan_cnt;
 reg [2:0]  scan_sel;
 always @(posedge clk or negedge rst_n) begin
 if (!rst_n) begin
 scan_cnt <= 17'd0;
 scan_sel <= 3'd0;
 end else if (scan_cnt >= CLK_FREQ / 8000 - 1) begin
 scan_cnt <= 17'd0;
 scan_sel <= scan_sel + 3'd1;
 end else begin
 scan_cnt <= scan_cnt + 17'd1;
 end
 end

 reg [3:0] cur_digit;
 always @(*) begin
 an = 8'b1111_1111;
 case (scan_sel)
 3'd0: begin an = 8'b1111_1110; cur_digit = sec_u;  end
 3'd1: begin an = 8'b1111_1101; cur_digit = sec_t;  end
 3'd2: begin an = 8'b1111_1011; cur_digit = min_u;  end
 3'd3: begin an = 8'b1111_0111; cur_digit = min_t;  end
 3'd4: begin an = 8'b1110_1111; cur_digit = hour_u; end
 3'd5: begin an = 8'b1101_1111; cur_digit = hour_t; end
 default: begin an = 8'b1111_1111; cur_digit = 4'd0; end
 endcase
 end

 always @(*) begin
 case (cur_digit)
 4'd0: seg = 8'b1100_0000;
 4'd1: seg = 8'b1111_1001;
 4'd2: seg = 8'b1010_0100;
 4'd3: seg = 8'b1011_0000;
 4'd4: seg = 8'b1001_1001;
 4'd5: seg = 8'b1001_0010;
 4'd6: seg = 8'b1000_0010;
 4'd7: seg = 8'b1111_1000;
 4'd8: seg = 8'b1000_0000;
 4'd9: seg = 8'b1001_0000;
 default: seg = 8'b1111_1111;
 endcase
 end
 endmodule
```

  


### 四、截**图与**照片整理

![图 59](/blog-content/hardware-design-fundamentals-3/images/fig_059.png)

图 8-1 RTL结构图

  

  

  

![图 60](/blog-content/hardware-design-fundamentals-3/images/fig_060.png)

图 8-2 资源开销截图

![图 61](/blog-content/hardware-design-fundamentals-3/images/fig_061.png)

图 8-3 基础计时仿真

![图 62](/blog-content/hardware-design-fundamentals-3/images/fig_062.png)

图 8-4 加快/进位仿真

![图 63](/blog-content/hardware-design-fundamentals-3/images/fig_063.jpg)

图 8-5 复位照片

![图 64](/blog-content/hardware-design-fundamentals-3/images/fig_064.jpg)

图 8-6 加快照片 1

![图 65](/blog-content/hardware-design-fundamentals-3/images/fig_065.jpg)

图 8-7 加快照片 2

![图 66](/blog-content/hardware-design-fundamentals-3/images/fig_066.jpg)

图 8-8 59秒进位 1

![图 67](/blog-content/hardware-design-fundamentals-3/images/fig_067.jpg)

图 8-9 59秒进位 2

![图 68](/blog-content/hardware-design-fundamentals-3/images/fig_068.jpg)

图 8-10 59分进位 1

![图 69](/blog-content/hardware-design-fundamentals-3/images/fig_069.jpg)

图 8-11 59分进位 2

### 五、实验结果与分析

| **测试项** | **操作**                 | **预期现象**                    | **分析**           |
|------------|--------------------------|---------------------------------|--------------------|
| 复位       | 按下 reset               | 显示回到 00:00:00               | 计时寄存器同步清零 |
| 正常计时   | fast_sw=0                | 秒位约每秒加 1                  | 1Hz 计时脉冲有效   |
| 加速计时   | fast_sw=1                | 时钟快速递增                    | 便于观察进位和回零 |
| 进位测试   | 观察 59 秒、59 分、23 时 | 秒到分、分到时、23:59:59 后回零 | BCD 计数逻辑正确   |

  


图 8-1 和图 8-2 为数字时钟仿真波形，用于验证基础计时、加快模式以及秒、分、时的进位回零过程。图 8-3 为 RTL 结构图，图 8-4 为资源开销截图；综合结果显示该设计占用 112 个 Slice LUT、75 个 Slice Registers、19 个 Bonded IOB 和 1 个 BUFGCTRL。图 8-5 至图 8-11 为开发板运行照片，分别对应复位、加快计时、59 秒进位和 59 分进位，显示结果符合数字时钟设计要求。

  


## 实验总结和心得

通过本次实验，进一步熟悉了 Multisim 组合逻辑与时序逻辑电路的搭建方法，也掌握了 Vivado/Verilog 中模块化设计、实例化、仿真验证、资源开销查看和上板观察的基本流程。前四题重点训练了全加器、比较器、计数器分频和计数器扩展的原理；后四题则通过 Verilog 代码实现比较器、加法器、计数器、状态机和数字时钟，体现了从电路原理到 FPGA 实现的完整过程。

  




