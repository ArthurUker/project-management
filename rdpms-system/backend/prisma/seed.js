import { PrismaClient } from '@prisma/client';
import pkg from 'bcryptjs';
const bcrypt = pkg;

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 开始初始化数据...');

  // 创建管理员
  const adminPassword = await bcrypt.hash('admin123', 10);
  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      password: adminPassword,
      name: '管理员',
      role: 'admin',
      status: 'active'
    }
  });
  console.log('✅ 管理员创建成功:', admin.username);

  // 创建普通用户
  const memberPassword = await bcrypt.hash('123456', 10);
  
  const users = [
    { username: 'gll', name: '谷磊磊', position: '研发工程师' },
    { username: 'lyq', name: '李应钦', position: '硬件工程师' },
    { username: 'zyx', name: '章烨鑫', position: '软件工程师' }
  ];

  for (const userData of users) {
    const user = await prisma.user.upsert({
      where: { username: userData.username },
      update: {},
      create: {
        username: userData.username,
        password: memberPassword,
        name: userData.name,
        position: userData.position,
        role: 'member',
        status: 'active'
      }
    });
    console.log('✅ 用户创建成功:', user.name);
  }

  // 创建示例项目（使用管理员作为默认负责人）
  const projects = [
    {
      code: 'PLATFORM-2.0C',
      name: '2.0C平台项目',
      type: 'platform',
      subtype: '2.0C',
      status: '进行中',
      position: '核心产品平台升级项目',
      managerId: admin.id
    },
    {
      code: 'PLATFORM-3.0',
      name: '3.0平台项目',
      type: 'platform',
      subtype: '3.0',
      status: '进行中',
      position: '新一代平台研发',
      managerId: admin.id
    },
    {
      code: 'COOP-BS',
      name: '贝索合作项目',
      type: '定制',
      subtype: '贝索',
      status: '待验证',
      position: '与贝索公司的合作项目',
      managerId: admin.id
    },
    {
      code: 'COOP-HNDX',
      name: '海南大学项目',
      type: '合作',
      subtype: '海南大学',
      status: '待加工',
      position: '海南大学联合研发项目',
      managerId: admin.id
    },
    {
      code: 'COOP-HM',
      name: '黑马合作项目',
      type: '合作',
      subtype: '黑马',
      status: '进行中',
      position: '黑马培训合作项目',
      managerId: admin.id
    },
    {
      code: 'TEST-MDX131',
      name: 'MDX131性能测试',
      type: '测试',
      subtype: 'MDX131',
      status: '进行中',
      position: 'MDX131型号设备性能测试验证',
      managerId: admin.id
    },
    {
      code: 'APP-AQUA',
      name: '水产项目',
      type: '应用',
      subtype: '水产',
      status: '进行中',
      position: '水产养殖应用场景落地',
      managerId: admin.id
    },
    {
      code: 'APP-FOOD',
      name: '食品安全检测项目',
      type: '应用',
      subtype: '食品安全',
      status: '规划中',
      position: '食品安全快速检测应用',
      managerId: admin.id
    }
  ];

  for (const projectData of projects) {
    const project = await prisma.project.upsert({
      where: { code: projectData.code },
      update: {},
      create: projectData
    });
    console.log('✅ 项目创建成功:', project.name);
  }

  console.log('🎉 数据初始化完成！');
}

main()
  .catch((e) => {
    console.error('❌ 初始化失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
