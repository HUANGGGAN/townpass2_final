import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * 身份驗證種子資料
 * 用於驗證前端傳來的身份資訊
 */
const seedIdentity = async () => {
  console.log('Seeding identity...');

  // 從前端 API 回應中提取的驗證資料
  const identities = [
    {
      account: 'wz7786',
      uuid: '7f3562f4-bb3f-4ec7-89b9-da3b4b5ff250',
      name: '金大森',
      idNo: 'A123456789',
    },
  ];

  for (const identity of identities) {
    // 檢查是否已存在（根據 account）
    const existing = await prisma.identity.findUnique({
      where: {
        account: identity.account,
      },
    });

    if (!existing) {
      await prisma.identity.create({
        data: {
          ...identity,
          count: 0, // 初始化 count 為 0
        },
      });
    } else {
      // 如果已存在，更新資料（保留 count）
      await prisma.identity.update({
        where: {
          account: identity.account,
        },
        data: {
          uuid: identity.uuid,
          name: identity.name,
          idNo: identity.idNo,
          // count 保持不變，由 danger-points 模組管理
        },
      });
    }
  }

  console.log(`Seeded ${identities.length} identity records`);
};

// 如果直接執行此檔案，則執行 seed
if (require.main === module) {
  seedIdentity()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

// 導出函數供統一腳本使用
export default seedIdentity;

