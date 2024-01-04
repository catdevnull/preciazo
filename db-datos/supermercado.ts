export enum Supermercado {
  Dia = "Dia",
  Carrefour = "Carrefour",
  Coto = "Coto",
  Jumbo = "Jumbo",
}
export const supermercados: Supermercado[] = [
  Supermercado.Carrefour,
  Supermercado.Coto,
  Supermercado.Dia,
  Supermercado.Jumbo,
];
export const hosts: { [host: string]: Supermercado } = {
  "diaonline.supermercadosdia.com.ar": Supermercado.Dia,
  "www.carrefour.com.ar": Supermercado.Carrefour,
  "www.cotodigital3.com.ar": Supermercado.Coto,
  "www.jumbo.com.ar": Supermercado.Jumbo,
};
export const colorBySupermercado: { [supermercado in Supermercado]: string } = {
  [Supermercado.Dia]: "#d52b1e",
  [Supermercado.Carrefour]: "#19549d",
  [Supermercado.Coto]: "#e20025",
  [Supermercado.Jumbo]: "#2dc850",
};
