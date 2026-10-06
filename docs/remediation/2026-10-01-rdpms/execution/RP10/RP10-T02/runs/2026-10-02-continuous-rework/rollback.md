# Rollback

回滚仅限 submit execute 内锁定/重读、从锁定行快照和currentVersion更新，以及新增集成用例。发布前若需要回滚，必须保留事务原子性且不得移除版本唯一约束/已要求的版本一致性；无schema迁移。
