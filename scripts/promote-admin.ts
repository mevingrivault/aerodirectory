import { prisma } from "@aerodirectory/database";

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();

  if (!email) {
    throw new Error("Usage: pnpm admin:promote -- <email>");
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      displayName: true,
      role: true,
    },
  });

  if (!user) {
    throw new Error(`Utilisateur introuvable: ${email}`);
  }

  if (user.role === "ADMIN") {
    console.log(`Le compte ${user.email} est deja administrateur.`);
    return;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { role: "ADMIN" },
  });

  console.log(
    `Compte promu administrateur: ${user.displayName || user.email} (${user.email})`,
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
