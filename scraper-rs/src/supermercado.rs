use clap::ValueEnum;
use reqwest::Url;

const SUPERMERCADOS_HOSTS: [(Supermercado, &'static str); 5] = [
    (Supermercado::Dia, "diaonline.supermercadosdia.com.ar"),
    (Supermercado::Carrefour, "www.carrefour.com.ar"),
    (Supermercado::Coto, "www.cotodigital3.com.ar"),
    (Supermercado::Jumbo, "www.jumbo.com.ar"),
    (Supermercado::Farmacity, "www.farmacity.com"),
];

#[derive(ValueEnum, Clone, Debug, Copy, PartialEq)]
pub enum Supermercado {
    Dia,
    Jumbo,
    Carrefour,
    Coto,
    Farmacity,
}
impl Supermercado {
    pub fn host(&self) -> &'static str {
        SUPERMERCADOS_HOSTS
            .into_iter()
            .find(|(supermercado, _host)| self == supermercado)
            .map(|(_, host)| host)
            .unwrap()
    }
    pub fn from_url(url: &Url) -> Option<Self> {
        SUPERMERCADOS_HOSTS
            .into_iter()
            .find(|(_supermercado, host)| *host == url.host_str().unwrap())
            .map(|(supermercado, _host)| supermercado)
    }
}

#[cfg(test)]
mod tests {
    use super::Supermercado;

    #[test]
    fn host_to_supermercado() {
        let supermercado = Supermercado::from_url(&reqwest::Url::parse("https://diaonline.supermercadosdia.com.ar/repelente-para-mosquitos-off--family-aerosol-165-cc-6338/p").unwrap());
        assert_eq!(supermercado, Some(Supermercado::Dia))
    }
    #[test]
    fn supermercado_to_host() {
        let host = Supermercado::Coto.host();
        assert_eq!(host, "www.cotodigital3.com.ar")
    }
}
