# pacproxy PAC加密代理服务器
English Readme:[a relative link](README_EN.md)

* 普通proxy代理服务器为防止盗用，需要用basic auth密码保护，但这就很容易被发现是代理服务器而被封锁。
* 普通proxy代理服务器没有SSL加密，如果SSL加密的话一般浏览器也不大支持，需要利用pac url让浏览器支持ssl加密的proxy代理。
* pacproxy js利用加密的pac url代替basic auth, 且用https加密流量，达到安全隐身的效果。
* pacproxy js可运行在任何nodejs环境下。

## 推荐
推荐用prcproxy安全的访问以下网站：
* 明慧网：https://www.minghui.org
* 干净世界：https://www.ganjing.com
* 神韵作品: https://shenyunzuopin.com
* 大法经书: https://www.falundafa.org

## 网站设置
可以直接在代码里编辑pacproxy.js里的configsInCode部分，也可以单独保存网站设置文件，参见[a relative link](examples\production.cfg)

## 运行
node pacproxy.js [网站配置文件] [监听端口号]
