use clap::ValueEnum;
use reqwest::Url;

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
    pub fn from_url(url: &Url) -> Option<Self> {
        match url.host_str().unwrap() {
            "www.carrefour.com.ar" => Some(Self::Carrefour),
            "diaonline.supermercadosdia.com.ar" => Some(Self::Dia),
            "www.cotodigital3.com.ar" => Some(Self::Coto),
            "www.jumbo.com.ar" => Some(Self::Jumbo),
            "www.farmacity.com" => Some(Self::Farmacity),
            _ => None,
        }
    }
}
