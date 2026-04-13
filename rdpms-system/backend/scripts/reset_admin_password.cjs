const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
(async ()=>{
  const prisma = new PrismaClient();
  try{
    const newPassword = 'grk321';
    const hashed = await bcrypt.hash(newPassword, 10);
    const admin = await prisma.user.update({ where: { username: 'admin' }, data: { password: hashed, updatedAt: new Date() } });
    await prisma.systemLog.create({ data: { action: 'password-reset', userId: admin.id, ip: 'cli' } });
    console.log('Password updated for user:', admin.username);
  }catch(e){
    console.error('Error updating password:', e);
    process.exit(1);
  }finally{
    await prisma.$disconnect();
  }
})();
