import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
    console.log('Đang dọn dẹp dữ liệu cũ (nếu có)...');
    await prisma.ticket.deleteMany({}); // Xóa vé cũ để tránh trùng lặp khi chạy lại lệnh

    console.log('Bắt đầu tạo dữ liệu vé mới...');

    // Chuẩn bị 400 vé STANDARD
    const standardTickets = Array.from({ length: 400 }).map(() => ({
        type: 'STANDARD' as const,
        price: 500000,
    }));

    // Chuẩn bị 100 vé VIP
    const vipTickets = Array.from({ length: 100 }).map(() => ({
        type: 'VIP' as const,
        price: 1500000,
    }));

    // Insert toàn bộ vào Database cùng một lúc (Bulk Insert)
    const result = await prisma.ticket.createMany({
        data: [...standardTickets, ...vipTickets],
    });

    console.log(`Tạo dữ liệu thành công: Đã chèn ${result.count} vé vào hệ thống!`);
}

main()
    .catch((e) => {
        console.error('Có lỗi xảy ra khi tạo dữ liệu:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });