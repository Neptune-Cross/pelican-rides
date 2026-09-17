# 鹈鹕合集

一个无需构建的静态动画作品集，包含八段内置的鹈鹕骑行旅程，并支持在网页中自行发布单文件 HTML：

- [海岸骑行](./coast.html)
- [漫游记](./wander.html)
- [破风骑行](./wind.html)
- [Astra-low-20260912-123602-鹈鹕测试](./astra-low-20260912-123602.html)
- [Astra-low-20260912-124711-鹈鹕测试](./astra-low-20260912-124711.html)
- [GPT-6-sol-low-20260912-143859-鹈鹕测试](./gpt-6-sol-low-20260912-143859.html)
- [GPT-6-sol-medium-20260912-144352-鹈鹕测试](./gpt-6-sol-medium-20260912-144352.html)
- [GPT-5.3-high-20260914-142919-鹈鹕测试](./gpt-5-3-high-20260914-142919.html)

两部测试分别来自 `pelican-cycle-20260912/index.html` 和 `pelican-svg-ride-20260912/index.html`。名称使用源文件的创建时间（UTC+08:00），精确到秒；原目录保持不变，收录副本保留原始画面和动画逻辑。

GPT-6-sol-medium 测试来自 `pelican-bicycle-svg/index.html`，创建时间为 2026-09-12 14:43:52（UTC+08:00）。收录副本保留原 SVG 与动画脚本，原始暂停按钮接入统一工具栏；观看时的减少动态效果偏好由合集播放器统一处理。

GPT-6-sol-low 测试来自 `鹈鹕骑行动画/index.html`，创建时间为 2026-09-12 14:38:59（UTC+08:00），因此排在 medium 之前。保留原 SVG 与 CSS 动画，通过观看容器维持画面比例；暂停、调速和减少动态效果由合集播放器统一处理。

在线地址：https://neptune-cross.github.io/pelican-rides/

## 使用

直接在浏览器打开 `index.html` 即可，无需安装依赖或启动服务器。在线版通过 GitHub Pages 从 `main` 分支根目录发布。

首页提供作品封面、收藏筛选、随机观看和 HTML 自助发布。选择或拖入一个或多个 `.html` / `.htm` 文件后，页面会自动读取网页标题作为默认名称，发布前可以逐一修改。

“公开发布”模式使用 GitHub Contents API，将文件提交到 `uploads/` 并更新 `uploads/manifest.json`。每部作品会获得独立 GitHub Pages 地址、并入“全部作品”，其他设备和访客均可访问。发布时需要细粒度 GitHub Token：Resource owner 选择 `Neptune-Cross`，Repository access 仅选择 `pelican-rides`，Repository permissions 中将 Contents 设为 Read and write。Token 只存在于本次请求的内存和输入框，不写入源代码、localStorage、sessionStorage 或 IndexedDB，发布结束或关闭窗口后会清空。

“仅存本机”模式保留原有的 IndexedDB 导入能力，适合临时预览；这类作品没有公开路径，也不会跨设备同步。两种模式的内容都通过沙盒 iframe 预览。建议使用资源已经内嵌的单文件 HTML；依赖本机相对路径的图片、脚本或样式无法随文件一起发布。单个文件限制为 20 MB。

收藏同样保存在当前浏览器；浏览器限制本地存储时，收藏仅在当前页面有效。

作品页提供返回合集、上一部／下一部与暂停；支持调速的作品保留速度控件（12:36:02 与 14:43:52 的原始测试只有暂停）。漫游记和破风骑行还支持昼夜切换。系统开启减少动态效果时，作品默认暂停；切换到后台后也会暂停播放。

## 文件

- `index.html`、`collection.css`、`collection.js`：合集首页，以及公开发布、本地导入、GitHub API、持久化与沙盒观看器。
- `uploads/manifest.json`：网页公开发布作品的清单；作品文件也保存在 `uploads/`。
- `coast.html`、`wander.html`、`wind.html`：三个独立动画，仍保留 `?embed=1` 嵌入模式。
- `astra-low-20260912-123602.html`、`astra-low-20260912-124711.html`：按创建时间命名的测试副本，也支持 `?embed=1`。
- `gpt-6-sol-medium-20260912-144352.html`：GPT-6-sol-medium 测试副本，支持 `?embed=1`。
- `gpt-6-sol-low-20260912-143859.html`：GPT-6-sol-low 测试副本，支持 `?embed=1`。
- `gpt-5-3-high-20260914-142919.html`：GPT-5.3-high 测试副本。
- `viewer.css`、`viewer.js`：作品页的统一导航与播放控件。
- `assets/`：从本项目动画截取的 WebP 封面、三种尺寸的首页主视觉与本地图标。图标来自 Lucide，许可证见 `assets/icons-LICENSE`。

浏览作品所需资源均位于本仓库，不依赖第三方 CDN 或在线字体；只有管理员执行公开发布时会调用 `api.github.com`。

## 本次验证

2026-09-12：通过桌面、平板、手机共 8 种首页尺寸检查，以及三个作品页的播放、暂停、速度、昼夜、导航、收藏持久化、禁用 JavaScript 和存储受限场景检查。修正了漫游记与破风骑行的车轮旋转中心，并使海岸骑行的车轮暂停与调速保持一致。

同日收录两部 Astra-low 测试：校验源文件与收录副本的 SVG 和动画脚本一致；通过 5 种屏幕尺寸的长标题与控件布局检查，以及新增作品的封面、收藏、播放、暂停、原有调速、减少动态效果和五部作品顺序切换检查。原有三部作品的回归检查通过。

同日收录 GPT-6-sol-medium 测试：校验原 SVG 与动画脚本一致；通过 4 种屏幕尺寸的封面和长标题布局检查，以及收藏、暂停恢复、减少动态效果和六部作品顺序切换检查。原有首页及三部动画的回归检查通过。

同日收录 GPT-6-sol-low 测试：校验原 SVG 与 CSS 动画关键帧一致；通过 5 种屏幕尺寸的完整画面、封面及长标题检查，以及收藏、暂停、调速、减少动态效果和七部作品的时间顺序与双向切换检查。

2026-09-17：新增浏览器端 HTML 自助发布。上传前可自行命名，公开作品自动提交到 `uploads/`、更新清单并生成独立网址；仍可选择仅存本机。通过真实 Chromium 和模拟 GitHub API 验证命名、UTF-8 文件路径、内容去重、串行提交、Token 不落盘、公开清单、本机持久化、收藏筛选和 390px 手机布局。
