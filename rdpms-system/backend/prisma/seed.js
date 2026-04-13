import { PrismaClient } from '@prisma/client';
import pkg from 'bcryptjs';
const bcrypt = pkg;

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 开始初始化数据...');

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

  // 试剂/芯片母版：9阶段完整设计
  const reagentMaster = await prisma.projectTemplate.upsert({
    where: { code: 'TPL-REAGENT-MASTER' },
    update: {},
    create: {
      code: 'TPL-REAGENT-MASTER',
      name: '🧪 试剂/芯片开发 全流程模版（母版）',
      description: '包含9个阶段的完整研发流程，可作为派生模版的基础',
      category: '试剂/芯片',
      isMaster: true,
      content: JSON.stringify({
        phases: [
          { key: 'phase1', order: 1, name: '立项', desc: '立项申请、可行性分析、评审', source: 'inherit', tasks: [{ title: '立项申请' }, { title: '可行性分析' }, { title: '评审' }] },
          { key: 'phase2', order: 2, name: '方案设计', desc: '引物探针设计 / 外购 / 合作 / 国标引用', source: 'inherit', tasks: [{ title: '引物/探针设计' }, { title: '外购方案' }, { title: '合作评估' }, { title: '国标对照' }] },
          { key: 'phase3', order: 3, name: '样本收集', desc: '样本来源、接收记录', source: 'inherit', tasks: [{ title: '样本来源确认' }, { title: '接收记录' }] },
          { key: 'phase4', order: 4, name: '片外核酸提取优化', desc: '提取试剂筛选、程序验证', source: 'inherit', tasks: [{ title: '提取试剂筛选' }, { title: '程序验证' }, { title: '效果评估' }] },
          { key: 'phase5', order: 5, name: '片外扩增试剂/程序优化', desc: '扩增体系、参数调试', source: 'inherit', tasks: [{ title: '扩增体系优化' }, { title: '参数调试' }, { title: '敏感性/特异性测试' }] },
          { key: 'phase6', order: 6, name: '芯片试产验证', desc: '试产、实验验证、性能测试', source: 'inherit', tasks: [{ title: '样片试产' }, { title: '实验验证' }, { title: '性能测试' }, { title: '问题记录' }] },
          { key: 'phase7', order: 7, name: '量产加工', desc: '芯片量产、生产加工', source: 'inherit', tasks: [{ title: '生产工艺确认' }, { title: '量产准备' }, { title: '生产加工' }, { title: '质量检验' }] },
          { key: 'phase8', order: 8, name: '客户验证', desc: '送样、客户反馈、验证报告', source: 'inherit', tasks: [{ title: '样品送样' }, { title: '收集客户反馈' }, { title: '生成验证报告' }] },
          { key: 'phase9', order: 9, name: '归档', desc: '文档整理、知识库归档、项目总结', source: 'inherit', tasks: [{ title: '文档整理' }, { title: '知识库归档' }, { title: '项目总结' }, { title: '经验教训记录' }] }
        ],
        milestones: [{ name: '立项通过' }, { name: '样品可用' }, { name: '试产通过' }, { name: '客户验证通过' }, { name: '项目关闭' }],
        defaults: { priority: '中' }
      }),
      createdBy: admin.id
    }
  });
  console.log('✅ 模版创建成功:', reagentMaster.name);

  // 试剂/芯片子模版：标准型（完整流程）
  await prisma.projectTemplate.upsert({
    where: { code: 'TPL-REAGENT-STD' },
    update: {},
    create: {
      code: 'TPL-REAGENT-STD',
      name: '标准型（完整流程）',
      description: '试剂/芯片 开发-标准型，包含完整9阶段',
      category: '试剂/芯片',
      parentId: reagentMaster.id,
      content: reagentMaster.content,
      createdBy: admin.id
    }
  });
  console.log('✅ 模版创建成功: 标准型');

  // 试剂/芯片子模版：快速验证型（禁用阶段3、4）
  await prisma.projectTemplate.upsert({
    where: { code: 'TPL-REAGENT-FAST' },
    update: {},
    create: {
      code: 'TPL-REAGENT-FAST',
      name: '快速验证型',
      description: '适用场景：已有提取方案，直接做扩增验证（禁用阶段3、4）',
      category: '试剂/芯片',
      parentId: reagentMaster.id,
      content: JSON.stringify({
        phases: [
          { key: 'phase1', order: 1, name: '立项', source: 'inherit', tasks: [{ title: '立项' }] },
          { key: 'phase2', order: 2, name: '方案设计', source: 'inherit', tasks: [{ title: '方案' }] },
          { key: 'phase3', order: 3, name: '样本收集', source: 'inherit', disabled: true, tasks: [] },
          { key: 'phase4', order: 4, name: '片外核酸提取优化', source: 'inherit', disabled: true, tasks: [] },
          { key: 'phase5', order: 5, name: '片外扩增试剂/程序优化', source: 'inherit', tasks: [{ title: '快速扩增验证' }] },
          { key: 'phase6', order: 6, name: '芯片试产验证', source: 'inherit', tasks: [{ title: '快速试产' }] },
          { key: 'phase7', order: 7, name: '量产加工', source: 'inherit', tasks: [{ title: '量产' }] },
          { key: 'phase8', order: 8, name: '客户验证', source: 'inherit', tasks: [{ title: '验证' }] },
          { key: 'phase9', order: 9, name: '归档', source: 'inherit', tasks: [{ title: '归档' }] }
        ],
        milestones: [{ name: '验证通过' }],
        defaults: { priority: '高' }
      }),
      createdBy: admin.id
    }
  });
  console.log('✅ 模版创建成功: 快速验证型');

  // 试剂/芯片子模版：合作开发型（禁用阶段3、4、5）
  await prisma.projectTemplate.upsert({
    where: { code: 'TPL-REAGENT-COOP' },
    update: {},
    create: {
      code: 'TPL-REAGENT-COOP',
      name: '合作开发型',
      description: '适用场景：合作方提供试剂，我方做芯片（禁用阶段3、4、5）',
      category: '试剂/芯片',
      parentId: reagentMaster.id,
      content: JSON.stringify({
        phases: [
          { key: 'phase1', order: 1, name: '立项', source: 'inherit', tasks: [{ title: '合作申请' }] },
          { key: 'phase2', order: 2, name: '方案设计', source: 'inherit', tasks: [{ title: '合作设计' }] },
          { key: 'phase3', order: 3, name: '样本收集', source: 'inherit', disabled: true, tasks: [] },
          { key: 'phase4', order: 4, name: '片外核酸提取优化', source: 'inherit', disabled: true, tasks: [] },
          { key: 'phase5', order: 5, name: '片外扩增试剂/程序优化', source: 'inherit', disabled: true, tasks: [] },
          { key: 'phase6', order: 6, name: '芯片试产验证', source: 'inherit', tasks: [{ title: '试产验证' }] },
          { key: 'phase7', order: 7, name: '量产加工', source: 'inherit', tasks: [{ title: '量产' }] },
          { key: 'phase8', order: 8, name: '客户验证', source: 'inherit', tasks: [{ title: '验证' }] },
          { key: 'phase9', order: 9, name: '归档', source: 'inherit', tasks: [{ title: '归档' }] }
        ],
        milestones: [{ name: '合作完成' }],
        defaults: { priority: '中' }
      }),
      createdBy: admin.id
    }
  });
  console.log('✅ 模版创建成功: 合作开发型');

  // 试剂/芯片子模版：性能测试型（禁用阶段2、3、4、5、7）
  await prisma.projectTemplate.upsert({
    where: { code: 'TPL-REAGENT-PERF' },
    update: {},
    create: {
      code: 'TPL-REAGENT-PERF',
      name: '性能测试型',
      description: '适用场景：已有产品，只做性能测试（禁用阶段2、3、4、5、7）',
      category: '试剂/芯片',
      parentId: reagentMaster.id,
      content: JSON.stringify({
        phases: [
          { key: 'phase1', order: 1, name: '立项', source: 'inherit', tasks: [{ title: '测试计划' }] },
          { key: 'phase2', order: 2, name: '方案设计', source: 'inherit', disabled: true, tasks: [] },
          { key: 'phase3', order: 3, name: '样本收集', source: 'inherit', disabled: true, tasks: [] },
          { key: 'phase4', order: 4, name: '片外核酸提取优化', source: 'inherit', disabled: true, tasks: [] },
          { key: 'phase5', order: 5, name: '片外扩增试剂/程序优化', source: 'inherit', disabled: true, tasks: [] },
          { key: 'phase6', order: 6, name: '芯片试产验证', source: 'inherit', tasks: [{ title: '性能测试' }, { title: '数据分析' }] },
          { key: 'phase7', order: 7, name: '量产加工', source: 'inherit', disabled: true, tasks: [] },
          { key: 'phase8', order: 8, name: '客户验证', source: 'inherit', tasks: [{ title: '提交报告' }] },
          { key: 'phase9', order: 9, name: '归档', source: 'inherit', tasks: [{ title: '归档' }] }
        ],
        milestones: [{ name: '测试完成' }],
        defaults: { priority: '高' }
      }),
      createdBy: admin.id
    }
  });
  console.log('✅ 模版创建成功: 性能测试型');

  // 试剂/芯片子模版：国标引用型（禁用阶段4、5）
  await prisma.projectTemplate.upsert({
    where: { code: 'TPL-REAGENT-STAND' },
    update: {},
    create: {
      code: 'TPL-REAGENT-STAND',
      name: '国标引用型',
      description: '适用场景：基于国标体系，跳过优化（禁用阶段4、5）',
      category: '试剂/芯片',
      parentId: reagentMaster.id,
      content: JSON.stringify({
        phases: [
          { key: 'phase1', order: 1, name: '立项', source: 'inherit', tasks: [{ title: '立项' }] },
          { key: 'phase2', order: 2, name: '方案设计', source: 'inherit', tasks: [{ title: '国标设计' }] },
          { key: 'phase3', order: 3, name: '样本收集', source: 'inherit', tasks: [{ title: '样本准备' }] },
          { key: 'phase4', order: 4, name: '片外核酸提取优化', source: 'inherit', disabled: true, tasks: [] },
          { key: 'phase5', order: 5, name: '片外扩增试剂/程序优化', source: 'inherit', disabled: true, tasks: [] },
          { key: 'phase6', order: 6, name: '芯片试产验证', source: 'inherit', tasks: [{ title: '国标验证' }] },
          { key: 'phase7', order: 7, name: '量产加工', source: 'inherit', tasks: [{ title: '量产' }] },
          { key: 'phase8', order: 8, name: '客户验证', source: 'inherit', tasks: [{ title: '检测' }] },
          { key: 'phase9', order: 9, name: '归档', source: 'inherit', tasks: [{ title: '报告' }] }
        ],
        milestones: [{ name: '国标符合' }],
        defaults: { priority: '中' }
      }),
      createdBy: admin.id
    }
  });
  console.log('✅ 模版创建成功: 国标引用型');

  // 设备开发母版：11阶段完整设计
  const equipMaster = await prisma.projectTemplate.upsert({
    where: { code: 'TPL-EQUIP-MASTER' },
    update: {},
    create: {
      code: 'TPL-EQUIP-MASTER',
      name: '⚙️ 设备开发 全流程模版（母版）',
      description: '包含11个阶段的完整设备研发流程',
      category: '设备',
      isMaster: true,
      content: JSON.stringify({
        phases: [
          { key: 'phase1', order: 1, name: '项目调研', desc: '市场调研、需求收集、竞品分析', source: 'inherit', tasks: [{ title: '市场调研' }, { title: '需求收集' }, { title: '竞品分析' }] },
          { key: 'phase2', order: 2, name: '立项审批', desc: '立项申请、审批流程', source: 'inherit', tasks: [{ title: '立项申请' }, { title: '审批流程' }] },
          { key: 'phase3', order: 3, name: '方案设计', desc: '设备结构、硬件设计、芯片设计', source: 'inherit', tasks: [{ title: '结构设计' }, { title: '硬件设计' }, { title: '芯片集成' }] },
          { key: 'phase4', order: 4, name: '设计方案评审', desc: '评审会议、评审意见', source: 'inherit', tasks: [{ title: '评审会议' }, { title: '意见处理' }] },
          { key: 'phase5', order: 5, name: '设计迭代再评审', desc: '方案修改、二次评审', source: 'inherit', tasks: [{ title: '方案修改' }, { title: '二次评审' }] },
          { key: 'phase6', order: 6, name: '采购', desc: 'BOM清单、供应商、采购跟进', source: 'inherit', tasks: [{ title: 'BOM清单' }, { title: '供应商选择' }, { title: '采购跟进' }] },
          { key: 'phase7', order: 7, name: '样机组装联调', desc: '组装、软硬件联调、问题记录', source: 'inherit', tasks: [{ title: '样机组装' }, { title: '软硬件联调' }, { title: '问题记录' }] },
          { key: 'phase8', order: 8, name: '结合芯片性能测试', desc: '整机性能测试、指标验证', source: 'inherit', tasks: [{ title: '性能测试' }, { title: '指标验证' }] },
          { key: 'phase9', order: 9, name: '加工生产', desc: '量产 / 定制版样机', source: 'inherit', tasks: [{ title: '生产工艺' }, { title: '量产准备' }, { title: '生产加工' }] },
          { key: 'phase10', order: 10, name: '客户验证', desc: '送样、客户反馈、验证报告', source: 'inherit', tasks: [{ title: '样机送样' }, { title: '客户反馈' }, { title: '验证报告' }] },
          { key: 'phase11', order: 11, name: '归档', desc: '文档整理、知识库归档', source: 'inherit', tasks: [{ title: '文档整理' }, { title: '知识库归档' }] }
        ],
        milestones: [{ name: '立项通过' }, { name: '样机完成' }, { name: '量产准备' }, { name: '客户验证通过' }],
        defaults: { priority: '中' }
      }),
      createdBy: admin.id
    }
  });
  console.log('✅ 模版创建成功:', equipMaster.name);

  // 设备子模版：定制开发型（禁用阶段1、4、5）
  await prisma.projectTemplate.upsert({
    where: { code: 'TPL-EQUIP-CUSTOM' },
    update: {},
    create: {
      code: 'TPL-EQUIP-CUSTOM',
      name: '定制开发型',
      description: '适用场景：客户需求明确，跳过调研和多轮评审（禁用阶段1、4、5）',
      category: '设备',
      parentId: equipMaster.id,
      content: JSON.stringify({
        phases: [
          { key: 'phase1', order: 1, name: '项目调研', source: 'inherit', disabled: true, tasks: [] },
          { key: 'phase2', order: 2, name: '立项审批', source: 'inherit', tasks: [{ title: '快速审批' }] },
          { key: 'phase3', order: 3, name: '方案设计', source: 'inherit', tasks: [{ title: '定制设计' }] },
          { key: 'phase4', order: 4, name: '设计方案评审', source: 'inherit', disabled: true, tasks: [] },
          { key: 'phase5', order: 5, name: '设计迭代再评审', source: 'inherit', disabled: true, tasks: [] },
          { key: 'phase6', order: 6, name: '采购', source: 'inherit', tasks: [{ title: '采购' }] },
          { key: 'phase7', order: 7, name: '样机组装联调', source: 'inherit', tasks: [{ title: '组装联调' }] },
          { key: 'phase8', order: 8, name: '结合芯片性能测试', source: 'inherit', tasks: [{ title: '性能测试' }] },
          { key: 'phase9', order: 9, name: '加工生产', source: 'inherit', tasks: [{ title: '生产' }] },
          { key: 'phase10', order: 10, name: '客户验证', source: 'inherit', tasks: [{ title: '验证' }] },
          { key: 'phase11', order: 11, name: '归档', source: 'inherit', tasks: [{ title: '归档' }] }
        ],
        milestones: [{ name: '样机交付' }],
        defaults: { priority: '高' }
      }),
      createdBy: admin.id
    }
  });
  console.log('✅ 模版创建成功: 定制开发型');

  // 设备子模版：性能测试型（禁用阶段1～6）
  await prisma.projectTemplate.upsert({
    where: { code: 'TPL-EQUIP-PERF' },
    update: {},
    create: {
      code: 'TPL-EQUIP-PERF',
      name: '性能测试型',
      description: '适用场景：已有样机，只做测试验证（禁用阶段1～6）',
      category: '设备',
      parentId: equipMaster.id,
      content: JSON.stringify({
        phases: [
          { key: 'phase1', order: 1, name: '项目调研', source: 'inherit', disabled: true, tasks: [] },
          { key: 'phase2', order: 2, name: '立项审批', source: 'inherit', disabled: true, tasks: [] },
          { key: 'phase3', order: 3, name: '方案设计', source: 'inherit', disabled: true, tasks: [] },
          { key: 'phase4', order: 4, name: '设计方案评审', source: 'inherit', disabled: true, tasks: [] },
          { key: 'phase5', order: 5, name: '设计迭代再评审', source: 'inherit', disabled: true, tasks: [] },
          { key: 'phase6', order: 6, name: '采购', source: 'inherit', disabled: true, tasks: [] },
          { key: 'phase7', order: 7, name: '样机组装联调', source: 'inherit', tasks: [{ title: '样机调试' }] },
          { key: 'phase8', order: 8, name: '结合芯片性能测试', source: 'inherit', tasks: [{ title: '性能测试' }, { title: '数据分析' }] },
          { key: 'phase9', order: 9, name: '加工生产', source: 'inherit', tasks: [{ title: '生产' }] },
          { key: 'phase10', order: 10, name: '客户验证', source: 'inherit', tasks: [{ title: '验证' }] },
          { key: 'phase11', order: 11, name: '归档', source: 'inherit', tasks: [{ title: '报告' }] }
        ],
        milestones: [{ name: '测试完成' }],
        defaults: { priority: '高' }
      }),
      createdBy: admin.id
    }
  });
  console.log('✅ 模版创建成功: 性能测试型');

  // 设备子模版：快速迭代型（禁用阶段1、2）
  await prisma.projectTemplate.upsert({
    where: { code: 'TPL-EQUIP-FAST' },
    update: {},
    create: {
      code: 'TPL-EQUIP-FAST',
      name: '快速迭代型',
      description: '适用场景：已立项，直接进入设计（禁用阶段1、2）',
      category: '设备',
      parentId: equipMaster.id,
      content: JSON.stringify({
        phases: [
          { key: 'phase1', order: 1, name: '项目调研', source: 'inherit', disabled: true, tasks: [] },
          { key: 'phase2', order: 2, name: '立项审批', source: 'inherit', disabled: true, tasks: [] },
          { key: 'phase3', order: 3, name: '方案设计', source: 'inherit', tasks: [{ title: '快速设计' }] },
          { key: 'phase4', order: 4, name: '设计方案评审', source: 'inherit', tasks: [{ title: '评审' }] },
          { key: 'phase5', order: 5, name: '设计迭代再评审', source: 'inherit', tasks: [{ title: '迭代' }] },
          { key: 'phase6', order: 6, name: '采购', source: 'inherit', tasks: [{ title: '采购' }] },
          { key: 'phase7', order: 7, name: '样机组装联调', source: 'inherit', tasks: [{ title: '快速组装' }] },
          { key: 'phase8', order: 8, name: '结合芯片性能测试', source: 'inherit', tasks: [{ title: '测试' }] },
          { key: 'phase9', order: 9, name: '加工生产', source: 'inherit', tasks: [{ title: '生产' }] },
          { key: 'phase10', order: 10, name: '客户验证', source: 'inherit', tasks: [{ title: '验证' }] },
          { key: 'phase11', order: 11, name: '归档', source: 'inherit', tasks: [{ title: '归档' }] }
        ],
        milestones: [{ name: '样机完成' }],
        defaults: { priority: '中' }
      }),
      createdBy: admin.id
    }
  });
  console.log('✅ 模版创建成功: 快速迭代型');

  // 创建示例项目
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
    await prisma.project.upsert({
      where: { code: projectData.code },
      update: {},
      create: projectData
    });
  }
  console.log('✅ 8个示例项目创建成功');

  // 预置试剂原料库数据（如不存在则创建）
  const materials = [
    { name:'Tris', mw:121.14, state:'solid', purity:99, defaultStockConc:1, defaultStockUnit:'M' },
    { name:'NaCl', mw:58.44, state:'solid', purity:99.5, defaultStockConc:5, defaultStockUnit:'M' },
    { name:'KCl', mw:74.55, state:'solid', purity:99, defaultStockConc:3, defaultStockUnit:'M' },
    { name:'EDTA', alias:['Na2-EDTA'], mw:372.24, state:'solid', purity:99, defaultStockConc:0.5, defaultStockUnit:'M' },
    { name:'MgCl2', alias:['氯化镁'], mw:203.30, state:'solid', purity:98, defaultStockConc:1, defaultStockUnit:'M' },
    { name:'CaCl2', alias:['氯化钙'], mw:110.98, state:'solid', purity:96, defaultStockConc:1, defaultStockUnit:'M' },
    { name:'HEPES', mw:238.30, state:'solid', purity:99, defaultStockConc:1, defaultStockUnit:'M' },
    { name:'SDS', alias:['十二烷基硫酸钠'], mw:288.38, state:'solid', purity:99, defaultStockConc:10, defaultStockUnit:'%' },
    { name:'DTT', alias:['二硫苏糖醇'], mw:154.25, state:'solid', purity:99, defaultStockConc:1, defaultStockUnit:'M' },
    { name:'β-巯基乙醇', mw:78.13, state:'liquid', density:1.114, purity:99, defaultStockConc:14, defaultStockUnit:'M' },
    { name:'GITC', alias:['异硫氰酸胍'], mw:118.16, state:'solid', purity:98, defaultStockConc:8, defaultStockUnit:'M' },
    { name:'尿素', mw:60.06, state:'solid', purity:99, defaultStockConc:8, defaultStockUnit:'M' },
    { name:'蔗糖', mw:342.30, state:'solid', purity:99, defaultStockConc:1, defaultStockUnit:'M' },
    { name:'甘油', mw:92.09, state:'liquid', density:1.261, purity:99, defaultStockConc:50, defaultStockUnit:'%' },
    { name:'BSA', alias:['牛血清白蛋白'], mw:66430, state:'solid', purity:98, defaultStockConc:10, defaultStockUnit:'mg·mL⁻¹' },
    { name:'Tween-20', mw:1228.0, state:'liquid', density:1.1, purity:100, defaultStockConc:10, defaultStockUnit:'%' },
    { name:'Triton X-100', mw:625.0, state:'liquid', density:1.065, purity:100, defaultStockConc:10, defaultStockUnit:'%' },
    { name:'NaOH', alias:['氢氧化钠'], mw:40.00, state:'solid', purity:97, defaultStockConc:10, defaultStockUnit:'M' },
    { name:'HCl', alias:['盐酸'], mw:36.46, state:'liquid', density:1.19, purity:37, defaultStockConc:12, defaultStockUnit:'M' },
    { name:'KH2PO4', mw:136.09, state:'solid', purity:99, defaultStockConc:1, defaultStockUnit:'M' },
    { name:'Na2HPO4', mw:141.96, state:'solid', purity:99, defaultStockConc:1, defaultStockUnit:'M' },
  ];

  for (const m of materials) {
    await prisma.reagentMaterial.upsert({
      where: { name: m.name },
      update: {},
      create: {
        name: m.name,
        alias: m.alias ? (Array.isArray(m.alias) ? m.alias.join(',') : m.alias) : null,
        casNumber: m.casNumber || null,
        molecularFormula: m.molecularFormula || null,
        mw: m.mw,
        purity: m.purity || 98,
        density: m.density || null,
        state: m.state || 'solid',
        defaultStockConc: m.defaultStockConc || null,
        defaultStockUnit: m.defaultStockUnit || null,
        supplier: m.supplier || null,
        notes: m.notes || null,
      }
    });
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
