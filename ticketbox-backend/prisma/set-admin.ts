import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
    console.log('Đang tìm kiếm người dùng đầu tiên trong cơ sở dữ liệu...');
    
    // Tìm user đầu tiên (sắp xếp theo userName)
    const firstUser = await prisma.user.findFirst({
        orderBy: {
            userName: 'asc',
        },
    });

    if (!firstUser) {
        console.log('Không tìm thấy người dùng nào. Vui lòng đăng ký tài khoản trước!');
        return;
    }

    console.log(`Đã tìm thấy người dùng: ${firstUser.userName} (ID: ${firstUser.id}) với quyền hiện tại: ${firstUser.role}`);

    // Cập nhật role thành ADMIN
    const updatedUser = await prisma.user.update({
        where: { id: firstUser.id },
        data: { role: 'ADMIN' },
    });

    console.log(`Cập nhật thành công! Người dùng ${updatedUser.userName} hiện đã là ADMIN.`);
}

main()
    .catch((e) => {
        console.error('Có lỗi xảy ra khi cập nhật quyền:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
