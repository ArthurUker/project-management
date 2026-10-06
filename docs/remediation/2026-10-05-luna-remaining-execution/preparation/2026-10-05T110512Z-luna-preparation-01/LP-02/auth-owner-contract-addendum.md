# T-RP-09 / T-RP-01 / T-RP-12 / D-S01-04 联合差分（待批准）

受控资料确认 access 使用 Bearer Authorization，refresh使用JSON body `{refreshToken}`。bounded source中未证明Cookie传输；CORS credentials配置不能当作Cookie认证。401/403/offline分别处理。

待具名负责人选择：refresh single-use CAS或family replay及精确窗口；失败清理必须只触碰发起generation仍拥有的token；双tab协调与generation存储位置；旧成功不能覆盖后登录身份、旧失败不能清空新session、原请求不能带新用户token重放；支持客户端/transport兼容窗口；session generation与cache generation是否关联；未知owner行隔离、IDB升级/abort/quota/页面关闭时最后副本恢复和当前授权下的查看/导出/放弃。

T-RP-09不代替D-S01-04：后者分别决定改密、reset、disable、降权后的access JWT失效时限；S03-OI-06复用同一D-S01-04批准。T-RP-01不允许从内容或首次登录猜owner。T-RP-12不启用未批准的oversize/quarantine自动处置。

注入actor不是完整JWT链，stub不是浏览器/真实IndexedDB。动态验收NOT_RUN，相关决定保持PROPOSED/PENDING。
