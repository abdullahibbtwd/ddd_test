const NBSP = "\u00A0";

/** Formats integer stotinki as "1 250,00 лв" (bg grouping with NBSP, comma decimals). */
export function formatLv(stotinki: number): string {
  const sign = stotinki < 0 ? "-" : "";
  const abs = Math.abs(stotinki);
  const whole = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  const cents = (abs % 100).toString().padStart(2, "0");
  return `${sign}${whole},${cents}${NBSP}лв`;
}
