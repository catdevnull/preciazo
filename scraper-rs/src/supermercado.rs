use clap::ValueEnum;

#[derive(ValueEnum, Clone, Debug, Copy)]
pub enum Supermercado {
    Dia,
    Jumbo,
    Carrefour,
    Coto,
    Farmacity,
}
impl Supermercado {
    pub fn host(&self) -> &'static str {
        match self {
            Self::Dia => "diaonline.supermercadosdia.com.ar",
            Self::Carrefour => "www.carrefour.com.ar",
            Self::Coto => "www.cotodigital3.com.ar",
            Self::Jumbo => "www.jumbo.com.ar",
            Self::Farmacity => "www.farmacity.com",
        }
    }
}
