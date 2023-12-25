export enum Supermercado {
  Dia = "Dia",
  Carrefour = "Carrefour",
  Coto = "Coto",
}

export const hosts: { [host: string]: Supermercado } = {
  "diaonline.supermercadosdia.com.ar": Supermercado.Dia,
  "www.carrefour.com.ar": Supermercado.Carrefour,
  "www.cotodigital3.com.ar": Supermercado.Coto,
};
export const colorBySupermercado: { [supermercado in Supermercado]: string } = {
  [Supermercado.Dia]: "#d52b1e",
  [Supermercado.Carrefour]: "#19549d",
  [Supermercado.Coto]: "#e20025",
};
