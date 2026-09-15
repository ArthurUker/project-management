/**
 * index.js —— 服务入口（systemd ExecStart 指向本文件）
 *
 * RF01 起，应用装配与启动逻辑分别位于：
 *   bootstrap/createApp.js —— 只装配应用，不监听、不连库
 *   bootstrap/server.js    —— 安全守卫 + 构造数据库客户端 + 监听端口
 *
 * 本文件只做入口转发，便于测试导入应用而不触发启动。
 */
import { startServer } from './bootstrap/server.js';

startServer();
