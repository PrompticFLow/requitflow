const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const YOUR_USER_ID = 'f1db2277-7982-492a-b379-f96a80fcceb7'; // chandansahaofficial@gmail.com
const OLD_USER_ID = '79123c2a-dbf8-441f-9624-951b8696f36b';  // lokesh@exomeinstruments.com

async function main() {
  // Transfer SMTP account
  const smtpMoved = await prisma.smtpAccount.updateMany({
    where: { userId: OLD_USER_ID },
    data: { userId: YOUR_USER_ID }
  });
  console.log('SMTP moved:', smtpMoved.count);

  // Transfer all email replies
  const repliesMoved = await prisma.emailReply.updateMany({
    where: { userId: OLD_USER_ID },
    data: { userId: YOUR_USER_ID }
  });
  console.log('Replies moved:', repliesMoved.count);

  // Transfer leads
  const leadsMoved = await prisma.lead.updateMany({
    where: { userId: OLD_USER_ID },
    data: { userId: YOUR_USER_ID }
  });
  console.log('Leads moved:', leadsMoved.count);

  // Transfer campaigns
  const campMoved = await prisma.campaign.updateMany({
    where: { userId: OLD_USER_ID },
    data: { userId: YOUR_USER_ID }
  });
  console.log('Campaigns moved:', campMoved.count);

  // Transfer email sequences
  const seqMoved = await prisma.emailSequence.updateMany({
    where: { userId: OLD_USER_ID },
    data: { userId: YOUR_USER_ID }
  });
  console.log('Email sequences moved:', seqMoved.count);

  // Transfer user settings
  const settings = await prisma.userSettings.findUnique({ where: { userId: OLD_USER_ID } });
  if (settings) {
    const { userId, id, ...rest } = settings;
    const existing = await prisma.userSettings.findUnique({ where: { userId: YOUR_USER_ID } });
    if (!existing) {
      await prisma.userSettings.create({ data: { ...rest, userId: YOUR_USER_ID } });
    } else {
      await prisma.userSettings.update({ where: { userId: YOUR_USER_ID }, data: rest });
    }
    console.log('Settings transferred');
  }

  console.log('All done! All data is now under chandansahaofficial@gmail.com');
}

main().catch(console.error).finally(() => prisma.$disconnect());
