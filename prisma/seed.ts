import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Seeding database...");

  // Create AppSettings singleton
  await prisma.appSettings.upsert({
    where: { id: "singleton" },
    update: {},
    create: {
      id: "singleton",
      bookingHorizonDays: 14,
      weekdayDisplayStartHour: 17,
      weekdayDisplayEndHour: 22,
      weekendDisplayStartHour: 9,
      weekendDisplayEndHour: 23,
      conflictCheckDaysAhead: 7,
    },
  });
  console.log("✅ AppSettings created");

  // Create 2 fields
  const field1 = await prisma.field.upsert({
    where: { id: "field-1" },
    update: { name: "Игрище вътре" },
    create: {
      id: "field-1",
      name: "Игрище вътре",
      sortOrder: 1,
      isActive: true,
    },
  });

  const field2 = await prisma.field.upsert({
    where: { id: "field-2" },
    update: { name: "Игрище вън" },
    create: {
      id: "field-2",
      name: "Игрище вън",
      sortOrder: 2,
      isActive: true,
    },
  });
  console.log(`✅ Fields created: ${field1.name}, ${field2.name}`);

  // Create admin user
  const adminPasswordHash = await bcrypt.hash("admin123", 12);
  const admin = await prisma.user.upsert({
    where: { email: "admin@balona-vratsa.bg" },
    update: {
      firstName: "Администратор",
      lastName: "Балона",
    },
    create: {
      email: "admin@balona-vratsa.bg",
      passwordHash: adminPasswordHash,
      phone: "+359888000001",
      firstName: "Администратор",
      lastName: "Балона",
      username: "admin",
      teamName: "Балона Враца",
      role: "ADMIN",
      canBookDirectly: true,
      isActive: true,
    },
  });
  console.log(`✅ Admin user created: ${admin.email}`);

  console.log("\n🎉 Seed complete!");
  console.log("   Admin email:    admin@balona-vratsa.bg");
  console.log("   Admin password: admin123");
  console.log("   ⚠️  Change the admin password after first login!");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
