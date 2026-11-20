import type { StatusVariant } from "@/components/status-badge";

export interface SampleInvoice {
  id: string;
  number: string;
  client: string;
  date: string;
  status: StatusVariant;
  /** stotinki */
  amount: number;
  due: number;
}

export const SAMPLE_INVOICES: SampleInvoice[] = [
  {
    id: "1",
    number: "ФК-2026-000142",
    client: "Ресторант „Златната ябълка“",
    date: "12.11.2026",
    status: "ok",
    amount: 125000,
    due: 0,
  },
  {
    id: "2",
    number: "ФК-2026-000143",
    client: "Хотел „Рила Парк“",
    date: "14.11.2026",
    status: "warn",
    amount: 348050,
    due: 148050,
  },
  {
    id: "3",
    number: "ФК-2026-000139",
    client: "Склад „Маритса Логистик“",
    date: "28.10.2026",
    status: "bad",
    amount: 96000,
    due: 96000,
  },
  {
    id: "4",
    number: "ФК-2026-000144",
    client: "Пекарна „Хлебарови“",
    date: "17.11.2026",
    status: "neutral",
    amount: 42000,
    due: 42000,
  },
  {
    id: "5",
    number: "ФК-2026-000140",
    client: "Детска градина „Слънчо“",
    date: "04.11.2026",
    status: "ok",
    amount: 78500,
    due: 0,
  },
  {
    id: "6",
    number: "ФК-2026-000141",
    client: "Мол „Централ“, Пловдив",
    date: "09.11.2026",
    status: "warn",
    amount: 1260000,
    due: 630000,
  },
];
