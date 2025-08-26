
# Initialize Prisma basics

- npm init -y
- npm install prisma typescript tsx @types/node --save-dev
- npx tsc --init
- npx prisma init --datasource-provider postgresql --output ../generated/prisma
- npm install -D ts-node @types/node typescript
- npx prisma db seed

