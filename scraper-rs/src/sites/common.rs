use std::borrow::Cow;

use tl::VDom;

pub fn get_meta_content<'a>(dom: &'a VDom<'a>, prop: &str) -> Option<Cow<'a, str>> {
    dom.query_selector(&format!("meta[property=\"{}\"]", prop))
        .and_then(|mut iter| iter.next())
        .and_then(|h| h.get(dom.parser()))
        .and_then(|n| n.as_tag())
        .and_then(|tag| tag.attributes().get("content").flatten())
        .map(|s| s.as_utf8_str())
}
