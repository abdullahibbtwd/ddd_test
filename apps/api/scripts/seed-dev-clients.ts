/**
 * Seeds ~30 realistic Bulgarian dev clients (companies + individuals). Safe to re-run.
 *
 *   pnpm --filter @ddcrm/api exec tsx scripts/seed-dev-clients.ts
 *
 * Idempotency:
 *   - When the `clients` table is empty → inserts every seed row.
 *   - When any row exists → upserts each COMPANY by `eik` (update or create); INDIVIDUAL
 *     seed rows are skipped (no stable natural key — avoids duplicate persons).
 *
 * Includes deliberately similar names (РАМБО / Рамбо, ФОКУС / Фокус), one archived
 * company, and checksum-valid EIKs from the public enterprises list.
 */
import {
  ClientKind,
  createId,
  normalizeClientName,
  normalizePhone,
  PaymentMethod,
} from "@ddcrm/shared";
import { PrismaPg } from "@prisma/adapter-pg";
import { loadEnvFiles } from "../src/config/load-env";
import { parseEnv } from "../src/config/env.schema";
import { PrismaClient } from "../src/generated/prisma/client";

type SeedRow = {
  kind: typeof ClientKind.COMPANY | typeof ClientKind.INDIVIDUAL;
  name: string;
  eik?: string;
  vatNumber?: string | null;
  registeredAddress?: string | null;
  legalRepresentative?: string | null;
  phone?: string | null;
  email?: string | null;
  preferredPaymentMethod?: (typeof PaymentMethod)[keyof typeof PaymentMethod] | null;
  notes?: string | null;
  isActive?: boolean;
};

const SEED_CLIENTS: SeedRow[] = [
  {
    kind: ClientKind.COMPANY,
    name: "РАМБО ЕООД",
    eik: "831641791",
    vatNumber: "BG831641791",
    registeredAddress: "гр. София, ул. Коста Лулчев 8",
    legalRepresentative: "Георги Рамбов",
    phone: "02 980 1234",
    email: "office@rambo-food.bg",
    preferredPaymentMethod: PaymentMethod.BANK_TRANSFER,
    notes: "Ресторант — център",
  },
  {
    kind: ClientKind.COMPANY,
    name: "Рамбо ООД",
    eik: "131268894",
    registeredAddress: "гр. Пловдив, бул. България 122",
    legalRepresentative: "Росен Иванов",
    phone: "032 601 234",
    email: "contact@rambo-plovdiv.bg",
    preferredPaymentMethod: PaymentMethod.CASH,
    notes: "Сходно име с РАМБО ЕООД (duplicate-warning demo)",
  },
  {
    kind: ClientKind.COMPANY,
    name: 'Ресторант „Златната ябълка“ ЕООД',
    eik: "175074752",
    registeredAddress: "гр. Варна, ул. Приморска 42",
    phone: "052 703 456",
    preferredPaymentMethod: PaymentMethod.CARD,
  },
  {
    kind: ClientKind.COMPANY,
    name: "Пицария Неапол ООД",
    eik: "121031861",
    registeredAddress: "гр. Бургас, ул. Александровска 17",
    phone: "056 812 345",
    preferredPaymentMethod: PaymentMethod.CASH,
  },
  {
    kind: ClientKind.COMPANY,
    name: "Кафе Central ЕООД",
    eik: "240000000",
    registeredAddress: "гр. София, ж.к. Лозенец, бл. 12",
    phone: "0888 123 456",
    preferredPaymentMethod: PaymentMethod.CARD,
  },
  {
    kind: ClientKind.COMPANY,
    name: "Супермаркет Фамилия ООД",
    eik: "122017149",
    registeredAddress: "гр. Русе, ул. Борисова 55",
    phone: "082 820 111",
    preferredPaymentMethod: PaymentMethod.BANK_TRANSFER,
  },
  {
    kind: ClientKind.COMPANY,
    name: 'Магазин „Техника плюс“ ЕООД',
    eik: "121283500",
    registeredAddress: "гр. Стара Загора, ул. Гурко 3",
    phone: "042 601 789",
  },
  {
    kind: ClientKind.COMPANY,
    name: "Хлебарница Добруджа ООД",
    eik: "200280180",
    registeredAddress: "гр. Добрич, ул. Независимост 9",
    phone: "058 602 333",
    preferredPaymentMethod: PaymentMethod.CASH,
  },
  {
    kind: ClientKind.COMPANY,
    name: 'ОУ „Васил Левски"',
    eik: "000725995",
    registeredAddress: "гр. София, ул. Шипка 18",
    phone: "02 942 1111",
    preferredPaymentMethod: PaymentMethod.BANK_TRANSFER,
    notes: "Училище",
  },
  {
    kind: ClientKind.COMPANY,
    name: 'ЧУ „София Колеж“ ЕООД',
    eik: "129007111",
    registeredAddress: "гр. София, ул. Зайчар 1",
    phone: "02 962 2222",
    notes: "Частно училище",
  },
  {
    kind: ClientKind.COMPANY,
    name: "Ресторант Balkan OOD",
    eik: "831622969",
    registeredAddress: "гр. Велинград, ул. Проломна 4",
    phone: "0359 601 22",
    notes: "Latin legal form in display name",
  },
  {
    kind: ClientKind.COMPANY,
    name: "ФОКУС ООД",
    eik: "119048540",
    registeredAddress: "гр. Плевен, ул. Гоце Делчев 7",
    phone: "064 801 234",
  },
  {
    kind: ClientKind.COMPANY,
    name: "Фокус ЕООД",
    eik: "121706255",
    registeredAddress: "гр. София, ул. Оборище 30",
    phone: "02 432 5678",
    notes: "Сходно име с ФОКУС ООД",
  },
  {
    kind: ClientKind.COMPANY,
    name: 'ПГ „Проф. д-р Асен Златаров"',
    eik: "200767512",
    registeredAddress: "гр. Варна, бул. Владислав Варненчик 90",
    phone: "052 510 100",
    notes: "Професионална гимназия",
  },
  {
    kind: ClientKind.COMPANY,
    name: "ПРОФИЛ-МЕДИКС ООД",
    eik: "117001983",
    registeredAddress: "гр. София, ул. Академик Георги Бончев 4",
    phone: "02 973 4567",
    preferredPaymentMethod: PaymentMethod.BANK_TRANSFER,
  },
  {
    kind: ClientKind.COMPANY,
    name: 'Детска градина „Слънчице" ООД',
    eik: "201847598",
    registeredAddress: "гр. Благоевград, ул. Пирин 11",
    phone: "073 883 210",
  },
  {
    kind: ClientKind.COMPANY,
    name: "ПРОФИЛ-ФОКУС ЕООД",
    eik: "207554310",
    registeredAddress: "гр. София, бул. Цариградско шосе 125",
    phone: "02 489 9900",
  },
  {
    kind: ClientKind.COMPANY,
    name: "Хотел Рила ООД",
    eik: "121769212",
    registeredAddress: "гр. Самоков, ул. Рила 2",
    phone: "0722 602 00",
    preferredPaymentMethod: PaymentMethod.CARD,
  },
  {
    kind: ClientKind.COMPANY,
    name: 'Закрит ресторант „Старият двор" ООД',
    eik: "208559196",
    registeredAddress: "гр. София, ул. Цар Симеон 14",
    phone: "02 955 0000",
    isActive: false,
    notes: "Архивиран клиент (is_active=false)",
  },
  {
    kind: ClientKind.COMPANY,
    name: "Козметика Beauty Line ЕООД",
    eik: "205756975",
    registeredAddress: "гр. София, бул. Витоша 88",
    phone: "0887 654 321",
    preferredPaymentMethod: PaymentMethod.CARD,
  },
  {
    kind: ClientKind.COMPANY,
    name: "Автосервиз Гараж ООД",
    eik: "831373560",
    registeredAddress: "гр. Пловдив, ул. Марица 44",
    phone: "032 944 556",
    preferredPaymentMethod: PaymentMethod.CASH,
  },
  {
    kind: ClientKind.COMPANY,
    name: "Електро 79 ЕООД",
    eik: "106513772",
    registeredAddress: "гр. Враца, ул. Христо Ботев 19",
    phone: "092 625 778",
  },
  {
    kind: ClientKind.COMPANY,
    name: "Транспорт БГ ЕАД",
    eik: "000649348",
    registeredAddress: "гр. София, бул. Марица 12",
    phone: "02 807 6000",
    preferredPaymentMethod: PaymentMethod.BANK_TRANSFER,
  },
  {
    kind: ClientKind.COMPANY,
    name: "Печатница Адрес ООД",
    eik: "175201304",
    registeredAddress: "гр. София, ул. Пирот 6",
    phone: "02 951 2345",
  },
  {
    kind: ClientKind.COMPANY,
    name: "Сервизни системи АД",
    eik: "833017552",
    registeredAddress: "гр. София, ул. Тинтява 15",
    phone: "02 865 4321",
    preferredPaymentMethod: PaymentMethod.BANK_TRANSFER,
  },
  {
    kind: ClientKind.INDIVIDUAL,
    name: "Иван Петров",
    phone: "0878 111 222",
    email: "ivan.petrov@example.bg",
    preferredPaymentMethod: PaymentMethod.CASH,
    notes: "Частен клиент — доставки у дома",
  },
  {
    kind: ClientKind.INDIVIDUAL,
    name: "Мария Георгиева",
    phone: "0889 333 444",
    email: "maria.g@example.bg",
  },
  {
    kind: ClientKind.INDIVIDUAL,
    name: "Стефан Димитров",
    phone: "0899 555 666",
    registeredAddress: "гр. София, ж.к. Младост 1, бл. 72",
    preferredPaymentMethod: PaymentMethod.BANK_TRANSFER,
  },
  {
    kind: ClientKind.INDIVIDUAL,
    name: "Елена Николова",
    phone: "0877 777 888",
    notes: "Кетъринг на събития",
  },
  {
    kind: ClientKind.INDIVIDUAL,
    name: "Петър Стоянов",
    phone: "0988 999 000",
    email: "petar.st@example.bg",
    preferredPaymentMethod: PaymentMethod.CARD,
  },
];

function toClientData(row: SeedRow) {
  const phone =
    row.phone != null && row.phone.trim() !== "" ? normalizePhone(row.phone) : null;
  return {
    kind: row.kind,
    name: row.name.trim().replace(/\s+/g, " "),
    nameNormalized: normalizeClientName(row.name),
    eik: row.kind === ClientKind.COMPANY ? row.eik! : null,
    vatNumber: row.vatNumber ?? null,
    registeredAddress: row.registeredAddress ?? null,
    legalRepresentative:
      row.kind === ClientKind.COMPANY ? (row.legalRepresentative ?? null) : null,
    phone,
    email: row.email?.toLowerCase() ?? null,
    preferredPaymentMethod: row.preferredPaymentMethod ?? null,
    notes: row.notes ?? null,
    isActive: row.isActive ?? true,
  };
}

async function main(): Promise<void> {
  loadEnvFiles();
  const env = parseEnv();
  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  try {
    const existingCount = await prisma.client.count();
    const tableEmpty = existingCount === 0;

    if (!tableEmpty) {
      console.log(
        `clients table has ${existingCount} row(s) — syncing COMPANY rows by EIK only (individuals skipped)`,
      );
    }

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const row of SEED_CLIENTS) {
      const data = toClientData(row);

      if (row.kind === ClientKind.COMPANY && row.eik) {
        const existing = await prisma.client.findFirst({ where: { eik: row.eik } });
        if (existing) {
          await prisma.client.update({
            where: { id: existing.id },
            data: {
              ...data,
              eik: row.eik,
            },
          });
          updated += 1;
          console.log(`updated company eik=${row.eik} (${data.name})`);
          continue;
        }
        await prisma.client.create({
          data: { id: createId(), ...data, eik: row.eik },
        });
        created += 1;
        console.log(`created company ${data.name}`);
        continue;
      }

      if (tableEmpty) {
        await prisma.client.create({
          data: { id: createId(), ...data },
        });
        created += 1;
        console.log(`created individual ${data.name}`);
      } else {
        skipped += 1;
      }
    }

    console.log(
      `done: created=${created} updated=${updated} skipped=${skipped} (seed rows=${SEED_CLIENTS.length})`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});