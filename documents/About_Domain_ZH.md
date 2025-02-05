# 关于域名

* 域名在网络加密中是至关重要，有域名才能获取受浏览器信任的数字证书，才能保证用户能安全的加密的上网。

* 如果是新手，建议申请域名时选择 [Cloudflare](https://www.cloudflare.com), 价格较低，不会在续费时涨价，免费隐藏whois注册信息。

* 如果已经有了域名，但没有whois保护，在网上查询whois时能查到你注册信息，可以把域名解析(nameserver)转移到cloudflare实现whois信息保护。

* 注册域名时需要注意有一些域名不支持whois加密，要避开这些[不支持保密的域名](https://www.domain.com/help/article/domain-management-tlds-not-supporting-privacy)。

* 要分享PAC链接翻墙时，需要确保对域名的控制权，因为域名如果过期被抢注的话，过去拥有的PAC链接的人不能访问外，还有被察觉那些人用了PAC链接的风险。

* 封锁域名除了在DNS解析阶段以外，都是要在第7层应用层做深度包检测，代价很高，如果我们全民申请域名翻墙的话，不可能完全封锁。只有一些常见的敏感网站会被长期封锁。

* 为避免DNS解析阶段的域名封锁，我们可以使用本机hosts文件解析域名，也可以在浏览器设置加密DNS，或操作系统上设置private DNS。由于常见的加密DNS服务经常会被封锁，可以用[CDN中转DOH服务](https://github.com/httpgate/wssproxy-agent/blob/main/CDN_PROXY_DOH.md)，避免加密服务DNS封锁。