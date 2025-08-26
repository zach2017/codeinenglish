// prisma/seed.js
const { PrismaClient } = require('../generated/prisma');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // --- Persons ---
  const alice = await prisma.person.upsert({
    where: { email: 'alice@example.com' },
    update: {},
    create: {
      email: 'alice@example.com',
      name: 'Alice Anderson',
      role: 'manager',
    },
  });

  const bob = await prisma.person.upsert({
    where: { email: 'bob@example.com' },
    update: {},
    create: {
      email: 'bob@example.com',
      name: 'Bob Builder',
      role: 'developer',
    },
  });

  // --- Tags ---
  const urgentTag = await prisma.tag.upsert({
    where: { name: 'Urgent' },
    update: {},
    create: {
      name: 'Urgent',
      color: '#FF0000',
    },
  });

  const frontendTag = await prisma.tag.upsert({
    where: { name: 'Frontend' },
    update: {},
    create: {
      name: 'Frontend',
      color: '#00AAFF',
    },
  });

  // --- Tasks ---
  const task1 = await prisma.task.create({
    data: {
      title: 'Setup project repo',
      description: 'Initialize repository with basic configs',
      status: 'TODO',
      priority: 'HIGH',
      creatorId: alice.id,
      assigneeId: bob.id,
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // due in 1 week
      tags: {
        connect: [{ id: urgentTag.id }],
      },
    },
  });

  const task2 = await prisma.task.create({
    data: {
      title: 'Build login page',
      description: 'Create React login form with validation',
      status: 'IN_PROGRESS',
      priority: 'MEDIUM',
      creatorId: bob.id,
      assigneeId: bob.id,
      parentId: task1.id,
      tags: {
        connect: [{ id: frontendTag.id }],
      },
    },
  });

  // --- Comments ---
  await prisma.comment.create({
    data: {
      content: 'Make sure to include password reset link!',
      taskId: task2.id,
      authorId: alice.id,
    },
  });

  console.log('✅ Seeding finished.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
